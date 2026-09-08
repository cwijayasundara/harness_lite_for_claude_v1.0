// Revision-specific navigation, never execution authority. See item 5's product reproduction:
// an approved reversal was reported as superseding code that still executed the old rule.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as a from './artifacts.mjs';
import { layout } from './paths.mjs';
import { loadConfig } from './config.mjs';
import { resolveCommit, changedFiles } from './diff.mjs';
import { traceEvidence } from './trace.mjs';
import * as graph from './graph.mjs';
import { pack, renderPack, estimateTokens } from './pack.mjs';

const git = (root, args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', ...args], {
  cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 30000,
  env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_LAZY_FETCH: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
function offlineRepository(root) {
  let partial = '';
  try { partial = git(root, ['config', '--local', '--get-regexp', '^(extensions\\.partialclone|remote\\..*\\.promisor)$']); }
  catch (error) { if (error.status !== 1) throw error; }
  if (partial) throw new Error('partial clone cannot supply offline context; fetch complete objects separately');
}

const MAX_RECORDS = 500, MAX_HISTORY = 2000, MAX_FILES = 20000, MAX_BYTES = 128 * 1024 * 1024;
const slugPattern = /^[a-z0-9][a-z0-9-]{0,62}$/;
const shaPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const safePath = p => typeof p === 'string' && p && !p.startsWith('/') && !/[\\\x00-\x1f:]/.test(p)
  && !p.split('/').some(s => !s || s === '.' || s === '..' || s.toLowerCase() === '.git');
const artifactPath = slug => `.aidlc/artifacts/${slug}`;
const section = (body, name) => body.match(new RegExp(`^## ${name}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'))?.[1].trim() ?? '';
const regular = row => row && /^100(644|755)$/.test(row.mode);
const entries = (root, revision) => git(root, ['ls-tree', '-r', '-l', '-z', revision]).split('\0').filter(Boolean).map(line => {
  const [metadata, ...name] = line.split('\t');
  const [mode, type, oid, size] = metadata.trim().split(/\s+/);
  return { path: name.join('\t'), mode, type, oid, size: Number(size) };
});
function treeEntry(root, revision, file) {
  if (!safePath(file)) throw new Error('unsafe repository evidence path');
  const raw = git(root, ['--literal-pathspecs', 'ls-tree', '-z', revision, '--', file]);
  if (!raw) return null;
  const [mode, type, oid] = raw.slice(0, raw.indexOf('\t')).split(' ');
  return { mode, type, oid };
}
function blob(root, revision, file) {
  const entry = treeEntry(root, revision, file);
  if (!regular(entry)) throw new Error(`missing or non-regular evidence: ${file}`);
  if (Number(git(root, ['cat-file', '-s', entry.oid])) > 4 * 1024 * 1024) throw new Error(`evidence exceeds read limit: ${file}`);
  return { text: git(root, ['cat-file', 'blob', entry.oid]), blob: entry.oid, revision, path: file };
}
function json(root, revision, file) {
  const value = blob(root, revision, file);
  try { return { ...value, data: JSON.parse(value.text) }; } catch { throw new Error(`malformed JSON: ${file}`); }
}
function ancestor(root, older, newer) {
  try { git(root, ['merge-base', '--is-ancestor', older, newer]); return true; }
  catch (error) { if (error.status === 1) return false; throw new Error('Git ancestry unavailable; fetch complete history'); }
}

// No checkout hooks, filters, submodules, symlinks or project commands. A private index/HEAD
// lets existing binding readers validate committed inputs without switching the user's branch.
export function withSnapshot(root, revision, fn) {
  root = path.resolve(root);
  offlineRepository(root);
  revision = resolveCommit(root, revision);
  const container = mkdtempSync(path.join(tmpdir(), 'harness-context-'));
  const work = path.join(container, 'snapshot');
  try {
    const files = entries(root, revision);
    if (files.length > MAX_FILES || files.reduce((n, e) => n + (Number.isFinite(e.size) ? e.size : 0), 0) > MAX_BYTES) throw new Error('snapshot exceeds navigation limit; use targeted git show/git grep');
    const included = files.filter(regular);
    if (included.some(e => !safePath(e.path))) throw new Error('snapshot contains unsafe paths; use targeted git show');
    git(root, ['-c', 'core.hooksPath=/dev/null', 'clone', '--shared', '--no-checkout', '--', root, work]);
    git(work, ['update-ref', '--no-deref', 'HEAD', revision]);
    git(work, ['read-tree', revision]);
    // checkout-index would apply configured filters. cat-file reads raw committed bytes instead.
    const data = execFileSync('git', ['cat-file', '--batch'], { cwd: work,
      input: included.map(e => e.oid).join('\n') + '\n', maxBuffer: MAX_BYTES + MAX_FILES * 100,
      env: { ...process.env, GIT_NO_LAZY_FETCH: '1' }, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
    materialize(work, included, data);
    return fn({ layout: layout(work) }, files.filter(e => !regular(e)).map(e => e.path));
  } finally { rmSync(container, { recursive: true, force: true }); }
}
import { mkdirSync, writeFileSync } from 'node:fs';
function materialize(root, files, data) {
  let offset = 0;
  for (const file of files) {
    const end = data.indexOf(10, offset);
    const header = data.subarray(offset, end).toString().split(' ');
    const length = Number(header[2]);
    if (header[0] !== file.oid || header[1] !== 'blob' || length !== file.size) throw new Error('incomplete Git snapshot');
    const dest = path.join(root, file.path);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, data.subarray(end + 1, end + 1 + length), { mode: file.mode === '100755' ? 0o755 : 0o644 });
    offset = end + 1 + length + 1;
  }
}

function contract(root, candidate, slug) {
  return withSnapshot(root, candidate, cfg => {
    const spec = a.read(cfg, slug, 'spec'), plan = a.read(cfg, slug, 'plan');
    if (!spec || !plan) throw new Error('candidate spec or plan missing');
    let requirements = [];
    try { requirements = a.requirementRows(spec.body); } catch { /* legacy has no fabricated mapping */ }
    const proof = a.proofRowsOf(plan.body);
    return {
      approval: { spec: { state: spec.state, binding: spec.binding, digest: spec.front.approval_digest ?? null },
        plan: { state: plan.state, binding: plan.binding, digest: plan.front.approval_digest ?? null } },
      bound: [spec, plan].every(v => v.state === 'approved' && v.binding === 'v2'),
      source: { reference: spec.front.source ?? null, revision: spec.front.source_revision ?? null, kind: spec.front.source_kind ?? 'legacy/unbound', digest: spec.front.source_digest ?? null },
      intent: { path: `${artifactPath(slug)}/intent.md`, revision: spec.front.intent_revision ?? candidate },
      spec: { path: `${artifactPath(slug)}/spec.md`, revision: candidate },
      plan: { path: `${artifactPath(slug)}/plan.md`, revision: candidate },
      design: section(spec.body, 'Design'), files: a.ownedFiles(plan.body),
      extends: a.extendsLinks(spec.front), supersedes: a.supersedesLinks(spec.front),
      behaviours: a.behavioursOf(spec.body).map(id => ({ id: `${slug}#${id}`, criteria: requirements.filter(r => r.behaviours.includes(id)).map(r => r.criterion), proof: proof.get(id) ?? null })),
    };
  });
}
function checkedReport(root, catalog, file, record, candidate) {
  const report = json(root, catalog, file);
  const r = report.data;
  if (r.revision?.base !== record.base || r.revision?.candidate !== candidate || r.revision?.change !== record.change
    || !Array.isArray(r.controls) || typeof r.ok !== 'boolean') throw new Error('check report revision/change identity mismatch');
  if (new Set(r.controls.map(c => c.control)).size !== r.controls.length || r.controls.some(c => !['pass', 'fail', 'skipped', 'errored'].includes(c.verdict))) throw new Error('malformed check controls');
  const expected = withSnapshot(root, candidate, cfg => traceEvidence({ ...cfg, diff: { base: record.base, candidate }, checkChange: record.change }, r.controls, { validCandidate: true }));
  if (JSON.stringify(r.trace) !== JSON.stringify(expected)) throw new Error('check trace does not match candidate bindings and observations');
  const scope = r.controls.find(c => c.control === 'scope-drift');
  const passed = r.controls.every(c => ['pass', 'skipped'].includes(c.verdict));
  if (r.ok !== passed) throw new Error('check verdict inconsistent with controls');
  return { path: file, revision: catalog, blob: report.blob,
    state: !passed ? 'failed' : scope?.verdict !== 'pass' ? 'scope-unavailable' : 'passed', trace: expected };
}
function validateRecord(data, slug) {
  const keys = ['version', 'change', 'repository', 'pr', 'base', 'candidate', 'merge', 'checks', 'host_review', 'integrated_checks'];
  if (!data || Array.isArray(data) || Object.keys(data).some(k => !keys.includes(k)) || data.version !== 1 || data.change !== slug
    || !slugPattern.test(slug) || !/^[\w.-]+\/[\w.-]+$/.test(data.repository) || !Number.isSafeInteger(data.pr) || data.pr < 1
    || !['base', 'candidate', 'merge'].every(k => typeof data[k] === 'string' && shaPattern.test(data[k]))
    || !['checks', 'host_review'].every(k => safePath(data[k])) || (data.integrated_checks !== undefined && !safePath(data.integrated_checks))) throw new Error('invalid delivery record schema or identity');
}

function delivery(root, revision, catalog, record, c) {
  const result = { ...record, ...c, state: 'delivery-unavailable', diagnostics: [], trust: 'unsigned local evidence' };
  for (const key of ['base', 'candidate', 'merge']) if (resolveCommit(root, record[key]) !== record[key]) throw new Error('delivery requires exact commits');
  const host = json(root, catalog, record.host_review);
  const h = host.data;
  if (h.version !== 1 || h.repository !== record.repository || h.pr !== record.pr || h.candidate !== record.candidate
    || h.host?.headRefOid !== record.candidate || h.host?.number !== record.pr
    || h.host?.state !== 'MERGED' || h.host?.mergeCommit?.oid !== record.merge || h.delivery?.merge !== record.merge
    || !Number.isFinite(Date.parse(h.delivery?.merged_at)) || h.delivery.merged_at !== h.host.mergedAt
    || !['github-api', 'simulated-transport'].includes(h.provenance) || h.error) throw new Error('host merge observation missing or inconsistent');
  result.host = { path: record.host_review, revision: catalog, blob: host.blob, provenance: h.provenance,
    assessment: h.assessment ?? 'unavailable', verified: false, recorded_verification: h.verified === true && h.provenance === 'github-api' && h.assessment === 'host-policy-approved',
    limitation: 'Archived unsigned observation; no live host authentication or deployment observation.' };
  if (!ancestor(root, record.base, record.candidate) || !ancestor(root, record.base, record.merge)) throw new Error('delivery base is not an ancestor of candidate and merge');
  result.checks = checkedReport(root, catalog, record.checks, record, record.candidate);
  const changed = changedFiles({ layout: { root }, diff: { base: record.base, candidate: record.candidate } }).filter(p => !p.startsWith('.aidlc/artifacts/'));
  result.merge_mismatches = changed.filter(p => JSON.stringify(treeEntry(root, record.candidate, p)) !== JSON.stringify(treeEntry(root, record.merge, p)));
  result.code = c.files.map(file => {
    const relative = file.replace(/\/$/, '');
    const atMerge = safePath(relative) ? treeEntry(root, record.merge, relative) : null;
    const atRequested = safePath(relative) ? treeEntry(root, revision, relative) : null;
    return { path: file, candidate: record.candidate, merge: record.merge, requested_revision: revision,
      present: Boolean(atMerge), present_at_requested: Boolean(atRequested),
      matches_requested: JSON.stringify(atMerge) === JSON.stringify(atRequested),
      mapping: 'declared file/commit, not symbol proof' };
  });
  if (result.code.some(f => !f.matches_requested)) result.diagnostics.push('Declared paths differ at the requested revision; inspect later delivery records and source. Historical proof does not prove the later code.');
  if (record.integrated_checks) {
    const integrated = contract(root, record.merge, record.change);
    if (!integrated.bound || JSON.stringify(integrated.approval) !== JSON.stringify(c.approval)) throw new Error('integrated evidence requires the same bound contract');
    result.integrated_checks = checkedReport(root, catalog, record.integrated_checks, record, record.merge);
  }
  if (!ancestor(root, record.merge, revision)) result.state = 'not-delivered-at-revision';
  else if (!c.bound) result.state = 'delivery-unbound';
  else if (result.merge_mismatches.length && result.integrated_checks?.state !== 'passed') result.state = 'integration-evidence-required';
  else result.state = 'recorded-delivered';
  const proof = result.integrated_checks?.trace ?? result.checks.trace;
  result.behaviours = c.behaviours.map(b => ({ ...b, execution: proof.behaviours.find(p => p.id === b.id)?.status ?? 'unverified' }));
  return result;
}

// Current records plus every distinct historical record reachable from the catalog. A deletion
// retains its last report snapshot. Conflicting versions remain ambiguous, not last-write-wins.
function catalogRecords(root, catalog) {
  const commits = git(root, ['rev-list', '--full-history', `--max-count=${MAX_HISTORY + 1}`, catalog, '--', '.aidlc/artifacts']).trim().split('\n').filter(Boolean);
  if (commits.length > MAX_HISTORY) throw new Error('catalog history exceeds navigation limit; narrow repository history externally');
  const records = new Map();
  for (const sha of [catalog, ...commits.filter(c => c !== catalog)]) {
    for (const e of entries(root, sha).filter(e => /^\.aidlc\/artifacts\/[^/]+\/delivery\.json$/.test(e.path))) {
      if (!records.has(e.path)) records.set(e.path, new Map());
      const variants = records.get(e.path);
      if (!variants.has(e.oid)) variants.set(e.oid, { ...e, revision: sha });
      if ([...records.values()].reduce((n, v) => n + v.size, 0) > MAX_RECORDS) throw new Error('delivery catalog exceeds navigation limit');
    }
  }
  return records;
}

export function productContext(cfg, { revision, records = 'HEAD' } = {}) {
  const root = cfg.layout.root;
  offlineRepository(root);
  let requested, catalog;
  try { requested = resolveCommit(root, revision); catalog = resolveCommit(root, records); }
  catch { throw new Error('product context requires --revision <commit> and optional --records <commit>; fetch missing refs'); }
  const out = { version: 1, revision: requested, records: catalog, meaning: 'recorded repository integration; not deployment or acceptance',
    coverage: 'partial: only recorded changes; untouched legacy behavior is unmodeled', changes: [], behaviours: [], findings: [],
    fallback: `git grep -n -F -e <term> ${requested} -- <path>; git show ${requested}:<path>` };
  try {
    if (git(root, ['rev-parse', '--is-shallow-repository']).trim() === 'true') throw new Error('shallow history; fetch full history before deriving delivery context');
    const recordsByPath = catalogRecords(root, catalog);
    for (const [file, variants] of recordsByPath) {
      const slug = file.split('/')[2];
      const deleted = !treeEntry(root, catalog, file);
      if (deleted) out.findings.push({ change: slug, code: 'deleted-record', message: 'Historical delivery retained from its committed record/report snapshot.' });
      if (variants.size > 1) out.findings.push({ change: slug, code: 'conflicting-records', message: 'Multiple record versions; no unique delivery authority.' });
      for (const v of variants.values()) {
        try {
          const r = json(root, v.revision, file).data;
          validateRecord(r, slug);
          const c = contract(root, r.candidate, slug);
          const row = delivery(root, requested, v.revision, r, c);
          row.record = { path: file, revision: v.revision, blob: v.oid, deleted };
          if (variants.size > 1) row.state = 'ambiguous-record';
          out.changes.push(row);
        } catch (error) {
          out.changes.push({ change: slug, state: 'delivery-unavailable', record: { path: file, revision: v.revision, blob: v.oid }, diagnostics: [error.message] });
        }
      }
    }
    // Proposals are an explicitly separate catalog projection, never applied as deliveries.
    for (const e of entries(root, catalog).filter(e => /^\.aidlc\/artifacts\/[^/]+\/spec\.md$/.test(e.path))) {
      const slug = e.path.split('/')[2];
      if (out.changes.some(c => c.change === slug)) continue;
      try {
        const spec = a.parse(blob(root, catalog, e.path).text);
        let intent = {};
        try { intent = a.parse(blob(root, catalog, `${artifactPath(slug)}/intent.md`).text).front; } catch { /* absent intent is unknown */ }
        out.changes.push({ change: slug, state: 'delivery-unknown', proposal: spec.front.status ?? 'draft', closed: intent.status === 'closed',
          supersedes: a.supersedesLinks(spec.front), extends: a.extendsLinks(spec.front), spec: { path: e.path, revision: catalog },
          diagnostics: ['No delivery record; approval and closure do not establish integration.'] });
      } catch (error) { out.findings.push({ change: slug, code: 'unavailable-proposal', message: error.message }); }
    }
    resolveBehaviours(out, root);
  } catch (error) { out.unavailable = error.message; }
  return out;
}

function resolveBehaviours(out, root) {
  const delivered = out.changes.filter(c => c.state === 'recorded-delivered');
  const nodes = new Map();
  for (const c of delivered) for (const b of c.behaviours) nodes.set(b.id, { ...b, change: c.change, state: 'effective', replaced_by: [] });
  const graphEdges = new Map([...nodes.keys()].map(id => [id, []]));
  const invalid = new Set();
  for (const c of out.changes.filter(c => c.state === 'ambiguous-record')) {
    for (const target of c.supersedes ?? []) if (nodes.has(target)) invalid.add(target);
  }
  for (const c of delivered) {
    for (const target of c.supersedes) {
      if (!nodes.has(target)) {
        out.findings.push({ change: c.change, code: 'missing-supersession-target', target });
        c.behaviours.forEach(b => invalid.add(b.id));
      } else {
        const previous = delivered.find(d => d.change === nodes.get(target).change);
        if (!ancestor(root, previous.merge, c.merge)) {
          out.findings.push({ change: c.change, code: 'supersession-order-unresolved', target, message: 'The replaced delivery is not an ancestor of its replacement.' });
          invalid.add(target); c.behaviours.forEach(b => invalid.add(b.id));
        }
        graphEdges.get(target).push(...c.behaviours.map(b => b.id));
      }
    }
    for (const target of c.extends) if (!delivered.some(d => d.change === target)) out.findings.push({ change: c.change, code: 'continuity-delivery-unknown', target });
  }
  let visits = 0;
  const terminals = (id, stack = []) => {
    if (++visits > 100000) throw new Error('supersession graph exceeds navigation limit; inspect specific delivery records');
    if (stack.includes(id)) {
      const cycle = [...stack.slice(stack.indexOf(id)), id];
      cycle.forEach(n => invalid.add(n));
      if (!out.findings.some(f => f.code === 'supersession-cycle' && f.path.includes(id))) out.findings.push({ code: 'supersession-cycle', path: cycle });
      return [];
    }
    const next = graphEdges.get(id) ?? [];
    return next.length ? [...new Set(next.flatMap(n => terminals(n, [...stack, id])))]: [id];
  };
  for (const [id, node] of nodes) {
    const final = terminals(id);
    node.replaced_by = graphEdges.get(id);
    if (node.replaced_by.length) {
      const replacements = [...new Set(final.map(n => nodes.get(n)?.change))];
      node.state = replacements.length === 1 && !final.some(n => invalid.has(n)) ? 'historical' : 'unresolved';
      if (replacements.length > 1) {
        final.forEach(n => invalid.add(n));
        out.findings.push({ code: 'competing-replacements', target: id, replacements });
      }
    }
  }
  for (const [id, node] of nodes) if (invalid.has(id)) node.state = 'unresolved';
  out.behaviours = [...nodes.values()];
}

export function renderProduct(view) {
  const lines = [`Product context at ${view.revision}`, `Evidence catalog ${view.records}`, view.meaning, view.coverage];
  if (view.unavailable) lines.push(`UNAVAILABLE: ${view.unavailable}`);
  for (const c of view.changes) {
    lines.push(`\n${c.change}: ${c.state}${c.closed ? ' (closed proposal)' : ''}`);
    if (c.source) lines.push(`  source: ${c.source.reference ?? 'unknown'} @ ${c.source.revision ?? 'unknown'}`);
    if (c.candidate) lines.push(`  candidate: ${c.candidate}; merge: ${c.merge}`);
    if (c.host) lines.push(`  host: ${c.host.provenance}, ${c.host.assessment}; ${c.trust}`);
    if (c.checks) lines.push(`  checks: ${c.checks.state}; proof: ${c.behaviours.map(b => `${b.id} ${b.execution}`).join(', ')}`);
    for (const b of c.behaviours ?? []) lines.push(`  ${b.id}: criteria ${b.criteria.join(', ') || 'unknown'}; proof ${b.proof ?? 'unknown'}; execution ${b.execution ?? 'unverified'}`);
    if (c.code) lines.push(`  code: ${c.code.map(f => `${f.path} @ ${f.merge}${f.present ? '' : ' (missing; inspect candidate snapshot)'}${f.matches_requested ? '' : ' (differs at requested revision)'}`).join(', ')}`);
    if (c.design) lines.push(`  design (${c.spec.path} @ ${c.spec.revision}): ${c.design}`);
    for (const d of c.diagnostics ?? []) lines.push(`  ${d}`);
  }
  for (const b of view.behaviours) lines.push(`${b.id}: ${b.state}${b.replaced_by.length ? ` -> ${b.replaced_by.join(', ')}` : ''}`);
  for (const f of view.findings) lines.push(`FINDING ${f.code}: ${JSON.stringify(f)}`);
  lines.push(`Fallback: ${view.fallback}`);
  return lines.join('\n');
}

export function revisionPack(cfg, question, { revision, records = 'HEAD', budget = 1200 } = {}) {
  if (!Number.isFinite(budget) || budget < 1) throw new Error('pack budget must be a positive number');
  const view = productContext(cfg, { revision, records });
  let result;
  try {
    result = withSnapshot(cfg.layout.root, view.revision, (snapshot, excluded) => {
      const snapshotCfg = loadConfig(snapshot.layout.root);
      if (!Array.isArray(snapshotCfg.graph.include) || snapshotCfg.graph.include.some(p => p !== '.' && !safePath(p))) throw new Error('unsafe graph include path; inspect source with git grep');
      const g = graph.ensure(snapshotCfg);
      return { ...pack(snapshotCfg, g, question, { budget }), coverage: { modules: Object.keys(g.modules).length, excluded,
        limitation: 'Heuristic supported-source navigation; unsupported languages and unmodeled legacy areas require source inspection.' } };
    });
  } catch (error) { result = { term: question, budget, tokens: 0, included: [], omitted: [], hit: false, unavailable: error.message }; }
  const paths = new Set([result.term, ...result.included.map(p => p.module)]);
  const relevant = view.changes.filter(c => c.files?.some(f => [...paths].some(p => p === f || f.endsWith('/') && p.startsWith(f))));
  // Include continuity and reversal ancestors even when a refactor moved the original file.
  for (let i = 0; i < relevant.length; i++) {
    const c = relevant[i];
    const links = [...(c.extends ?? []), ...(c.supersedes ?? []).map(s => s.split('#')[0])];
    for (const row of view.changes) if (links.includes(row.change) && !relevant.includes(row)) relevant.push(row);
  }
  for (const c of relevant) {
    const text = `${c.change}: ${c.state}\nsource ${JSON.stringify(c.source)}\nspec ${JSON.stringify(c.spec)}\ndesign ${c.design}\nbehaviours ${JSON.stringify(c.behaviours)}\ncandidate ${c.candidate}; merge ${c.merge}; ${c.trust}`;
    const tokens = estimateTokens(text);
    if (result.tokens + tokens <= budget) { result.included.push({ kind: 'delivery', module: c.spec.path, start: 1, end: 1, text, tokens }); result.tokens += tokens; }
    else result.omitted.push(`${c.change} (delivery context)`);
  }
  return { ...result, revision: view.revision, records: view.records, product_unavailable: view.unavailable ?? null,
    product_findings: view.findings, product_coverage: view.coverage, relevant_changes: relevant.map(c => c.change), fallback: view.fallback };
}
export function renderRevisionPack(result) {
  return [`Revision ${result.revision}; catalog ${result.records}`, result.product_coverage,
    result.coverage?.limitation ?? result.unavailable, result.product_unavailable,
    result.hit ? null : `No structural graph entry for ${result.term}; any delivery references below are artifact links.`,
    renderPack({ ...result, hit: result.included.length > 0 }),
    ...result.product_findings.map(f => `FINDING ${JSON.stringify(f)}`), `Fallback: ${result.fallback}`].filter(Boolean).join('\n');
}
