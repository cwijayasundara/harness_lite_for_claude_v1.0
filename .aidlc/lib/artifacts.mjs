// The artifact chain: `intent.md -> spec.md -> plan.md -> diff -> review.md`, one directory per
// change, three human gates.
//
// This replaces lib/contract.mjs, which held one file with nine required sections and two
// independently sealed halves. That design was defensible and it cost too much: 142 of the
// repository's first 181 commits touched only artifacts, a two-line registry change took eight
// commits and a rework, and the sealed digest of half a file had to be recomputed by stripping
// the other half out of it. The playbook asks for three short files and three gates. This is
// those three files.
//
// An approval is frontmatter a human commits, and a digest of the body at the moment they
// approved it. Editing an approved body does not silently un-approve it — it reports
// `stale-approval`, which is louder, and scope-drift then treats the plan as owning nothing.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const KINDS = ['intent', 'spec', 'plan', 'review'];
export const GATED = ['spec', 'plan'];

const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

// Templates live one directory up from this file, wherever the harness that resolved this module
// actually is — a checkout, or a plugin cache entry. Never a project's own `.aidlc/`, which only
// ever holds `harness.toml`, the generated shim and the install record.
const TEMPLATES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');

// Frontmatter is a small fixed set of scalar keys. A YAML parser would be a dependency, and the
// only shapes this has to read are the ones `approve` writes.
export function parse(text) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) return { front: {}, body: text.replace(/^﻿/, '') };
  const front = {};
  for (const line of match[1].split('\n')) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line.trim());
    if (kv) front[kv[1]] = kv[2].trim();
  }
  return { front, body: text.slice(match[0].length) };
}

export function render(front, body) {
  const keys = Object.entries(front).filter(([, v]) => v !== null && v !== undefined && v !== '');
  return `---\n${keys.map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n${body.replace(/^\n+/, '')}`;
}

// The digest covers the body only. Frontmatter carries the approval itself, so including it would
// make every approval change the thing it approves.
export const bodyDigest = (text) => hash(parse(text).body.replace(/\r\n/g, '\n').trimEnd() + '\n');

// why: requirement-traceability/reproduction.json: an intent correction and a relationship
// edit both left product authority approved. New approvals bind all non-audit inputs.
const AUDIT_KEYS = new Set(['status', 'by', 'at', 'digest', 'approval_digest']);
export function strictParse(text) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) throw new Error('trace binding requires scalar frontmatter');
  const seen = new Set();
  for (const line of match[1].split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const kv = /^([a-z_]+): (\S.*)$/.exec(line);
    if (!kv || seen.has(kv[1]) || /^[\[\]{|>&*!"']/.test(kv[2])) {
      throw new Error('trace binding requires unique plain scalar metadata; nested, quoted and duplicate fields are unsupported');
    }
    seen.add(kv[1]);
  }
  return parse(text);
}

export function approvalDigest(text) {
  const { front, body } = strictParse(text);
  const inputs = Object.fromEntries(Object.entries(front).filter(([k]) => !AUDIT_KEYS.has(k)).sort(([a], [b]) => a.localeCompare(b)));
  return hash(JSON.stringify({ version: 2, inputs, body: body.replace(/\r\n/g, '\n').trimEnd() + '\n' }));
}

const gitRead = (cfg, ...args) => execFileSync('git', args, { cwd: cfg.layout.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const commitId = (cfg, ref) => gitRead(cfg, 'rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`).trim();
const safeSourcePath = value => typeof value === 'string' && value && !path.isAbsolute(value)
  && !value.split('/').some(p => !p || p === '.' || p === '..') && !/[\\\x00-\x1f:]/.test(value);

export function requirementRows(body) {
  if ((body.match(/^## Requirements\s*$/gm) ?? []).length !== 1) throw new Error('Requirements must have exactly one table section');
  const section = body.match(/^## Requirements\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? '';
  const rows = [];
  for (const line of section.split('\n')) {
    if (!line.trim() || /^\|\s*Source criterion\s*\|/i.test(line) || /^\|[-\s:]+\|[-\s:]+\|$/.test(line)) continue;
    const m = /^\|\s*([^|]+?)\s*\|\s*(B\d+(?:\s*,\s*B\d+)*)\s*\|$/.exec(line);
    if (!m) throw new Error('Requirements must contain only source criterion | comma-separated behaviour IDs rows');
    rows.push({ criterion: m[1], behaviours: m[2].split(',').map(s => s.trim()) });
  }
  const ids = behavioursOf(body), criteria = new Set(), covered = new Set();
  for (const row of rows) {
    if (criteria.has(row.criterion) || new Set(row.behaviours).size !== row.behaviours.length || row.behaviours.some(id => !ids.includes(id))) throw new Error('Requirements has duplicate criteria/IDs or unknown behaviours');
    criteria.add(row.criterion);
    row.behaviours.forEach(id => covered.add(id));
  }
  if (!rows.length || !ids.length || new Set(ids).size !== ids.length || ids.some(id => !covered.has(id))) throw new Error('Requirements must cover every numbered behaviour');
  return rows;
}

function sourceBinding(cfg, intent, pinnedRevision) {
  const { source, source_revision } = strictParse(intent.text).front;
  if (!source || !source_revision || /[<>\x00-\x1f]/.test(source + source_revision)) throw new Error('intent requires source and source_revision plain scalar references');
  if (/^https:\/\//.test(source)) {
    const url = new URL(source);
    if (url.username || url.password) throw new Error('source URL cannot contain credentials');
    return { source, source_revision, source_kind: 'external-asserted' };
  }
  if (!safeSourcePath(source)) throw new Error('repository source must be a relative path without traversal');
  const revision = commitId(cfg, pinnedRevision ?? source_revision);
  const entry = gitRead(cfg, '--literal-pathspecs', 'ls-tree', revision, '--', source);
  if (!/^100(644|755) blob /.test(entry)) throw new Error('repository source must resolve to a regular committed file');
  const blob = execFileSync('git', ['show', `${revision}:${source}`], { cwd: cfg.layout.root, stdio: ['ignore', 'pipe', 'pipe'] });
  return { source, source_revision: revision, source_kind: 'repository', source_digest: hash(blob) };
}

function intentInputDigest(text) {
  const { front, body } = strictParse(text);
  // closed is lifecycle metadata, not a requirement correction. Preserve its established
  // meaning while retaining the exact originally reviewed snapshot in intent_digest.
  const { status, ...inputs } = front;
  return hash(render(Object.fromEntries(Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b))), body));
}

function bindingInputs(cfg, slug, kind, body) {
  if (kind === 'plan') {
    const spec = read(cfg, slug, 'spec');
    if (spec?.state !== 'approved' || spec.binding !== 'v2') throw new Error('re-approve the spec with trace inputs before approving the plan');
    return { spec_digest: bodyDigest(spec.text), spec_approval_digest: spec.front.approval_digest };
  }
  const intent = read(cfg, slug, 'intent');
  if (!intent || !isCommitted(cfg.layout.root, intent.file)) throw new Error('commit intent.md with source and source_revision before approving the spec');
  const source = sourceBinding(cfg, intent);
  requirementRows(body);
  return { source_digest: undefined, ...source, intent_digest: hash(intent.text), intent_input_digest: intentInputDigest(intent.text), intent_revision: commitId(cfg, 'HEAD') };
}

// Cache by immutable HEAD and path, never by working content. Only commits that changed the
// version field need inspection. A stripped binding cannot downgrade a previously bound gate.
const bindingHistory = new Map();
function hadBinding(cfg, target) {
  let head;
  try { head = commitId(cfg, 'HEAD'); } catch { return false; }
  const rel = path.relative(cfg.layout.root, target);
  const key = `${cfg.layout.root}:${head}:${rel}`;
  if (!bindingHistory.has(key)) {
    if (gitRead(cfg, 'rev-parse', '--is-shallow-repository').trim() === 'true') throw new Error('legacy binding history unavailable in shallow checkout; fetch full history');
    const commits = gitRead(cfg, 'log', '--format=%H', '-G', '^(approval_version:|status: approved)', head, '--', rel).trim().split('\n').filter(Boolean);
    const found = commits.some(sha => {
      let text;
      try { text = gitRead(cfg, 'show', `${sha}:${rel}`); } catch { return false; } // deletion
      const front = parse(text).front;
      return front.status === 'approved' && Boolean(front.approval_version);
    });
    if (bindingHistory.size > 1000) bindingHistory.clear();
    bindingHistory.set(key, found);
  }
  return bindingHistory.get(key);
}

export const dir = (cfg, slug) => path.join(cfg.layout.artifacts, slug);
export const file = (cfg, slug, kind) => path.join(dir(cfg, slug), `${kind}.md`);

export function isCommitted(root, target) {
  if (!existsSync(target)) return false;
  try {
    const rel = path.relative(root, target);
    // Tracked, and with no uncommitted modification. Both halves matter: a file that was never
    // added and a file edited after being added are equally not what a reviewer approved.
    execFileSync('git', ['ls-files', '--error-unmatch', rel], { cwd: root, stdio: 'ignore' });
    return execFileSync('git', ['diff', '--name-only', 'HEAD', '--', rel], { cwd: root, encoding: 'utf8' }).trim() === '';
  } catch { return false; }
}

function replaceAtomic(target, text) {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tmp, text, { flag: 'wx', mode: 0o600 });
    renameSync(tmp, target);
  } catch (error) { rmSync(tmp, { force: true }); throw error; }
}

export function create(cfg, slug, templates) {
  const target = dir(cfg, slug);
  if (existsSync(target)) throw new Error(`${path.relative(cfg.layout.root, target)} already exists`);
  mkdirSync(target, { recursive: true });
  const written = [];
  for (const kind of KINDS) {
    const source = path.join(templates, `${kind}.md`);
    if (!existsSync(source)) continue;
    const text = readFileSync(source, 'utf8').replaceAll('{{slug}}', slug).replaceAll('{{date}}', new Date().toISOString().slice(0, 10));
    writeFileSync(file(cfg, slug, kind), text, { flag: 'wx' });
    written.push(file(cfg, slug, kind));
  }
  return written;
}

// The one approval verb. It replaces `contract accept`, `contract seal --scope spec`,
// `contract seal --scope plan` and `contract evidence` — four commands and, because each seal
// demanded a commit before the next, four commits for one decision.
export function approve(cfg, slug, kind, { by, at = new Date().toISOString(), anyway = null } = {}) {
  if (!GATED.includes(kind)) throw new Error(`only ${GATED.join(' and ')} are approved; ${kind} is not a gate`);
  // B4: a flag with no reason is refused — the reason is the point, not the flag.
  if (anyway !== null && anyway !== undefined && (typeof anyway !== 'string' || !anyway.trim())) {
    throw new Error('--anyway needs a reason: --anyway "<why this is fine here>"');
  }

  // --by is an audit label, not authentication. Environment flags cannot approve a gate.
  if (!by || /[\r\n]/.test(by)) throw new Error('an approval needs an approver: --by <identity>');

  const target = file(cfg, slug, kind);
  if (!existsSync(target)) throw new Error(`not found: ${path.relative(cfg.layout.root, target)}`);

  // Ordering. A plan approved before its spec is a plan approved against nothing.
  if (kind === 'plan') {
    const spec = read(cfg, slug, 'spec');
    if (spec?.front.status !== 'approved') throw new Error('approve the spec before the plan');
    if (spec.state === 'stale-approval') throw new Error('the spec changed after it was approved; re-approve it first');
  }

  // Committed first, always. An approval of a working copy is an approval of something no
  // reviewer can read and no history records.
  if (!isCommitted(cfg.layout.root, target)) throw new Error(`commit ${path.relative(cfg.layout.root, target)} before approving it`);

  const text = readFileSync(target, 'utf8');
  const { front, body } = parse(text);

  // B1 and B2: content, not just state — after every precondition above, so an existing message
  // wins when both apply. `--anyway <reason>` (B4) proceeds anyway and leaves a record.
  const issues = contentIssues(cfg, slug, kind, front, body, target);
  if (issues.length && !anyway) throw new Error(issues.join('\n'));

  strictParse(text);
  const inputs = bindingInputs(cfg, slug, kind, body); // never waived by --anyway
  const next = { ...front, ...inputs, status: 'approved', by, at, digest: bodyDigest(text), approval_version: '2', ...(anyway ? { approved_anyway: anyway } : {}) };
  next.approval_digest = approvalDigest(render(next, body));
  replaceAtomic(target, render(next, body));
  return { file: target, digest: next.approval_digest };
}

export function read(cfg, slug, kind) {
  const target = file(cfg, slug, kind);
  if (!existsSync(target)) return null;
  const text = readFileSync(target, 'utf8');
  const { front, body } = parse(text);
  const approved = front.status === 'approved';
  const spec = kind === 'plan' && front.spec_digest ? read(cfg, slug, 'spec') : null;
  let stale = approved && ((front.digest && front.digest !== bodyDigest(text)) ||
    (front.spec_digest && (!spec || spec.state !== 'approved' || front.spec_digest !== bodyDigest(spec.text))));
  let binding = 'legacy/unbound';
  let bindingError = null;
  if (approved && GATED.includes(kind)) {
    try {
      if (front.approval_version) {
        if (front.approval_version !== '2') throw new Error('unknown approval binding version');
        if (front.digest !== bodyDigest(text)) throw new Error('approved body digest missing or changed');
        if (approvalDigest(text) !== front.approval_digest) throw new Error('approval inputs changed');
        if (kind === 'spec') {
          const intent = read(cfg, slug, 'intent');
          if (!intent || intentInputDigest(intent.text) !== front.intent_input_digest || !isCommitted(cfg.layout.root, intent.file)) throw new Error('intent changed or is uncommitted; review impact and re-approve spec and plan');
          const snapshot = gitRead(cfg, 'show', `${commitId(cfg, front.intent_revision)}:${path.relative(cfg.layout.root, intent.file)}`);
          if (hash(snapshot) !== front.intent_digest || intentInputDigest(snapshot) !== front.intent_input_digest) throw new Error('intent revision does not match approved input');
          const source = sourceBinding(cfg, intent, front.source_revision);
          if (Object.entries(source).some(([k, v]) => front[k] !== v)) throw new Error('source binding changed');
          requirementRows(body);
        } else if (!spec || spec.binding !== 'v2' || spec.state !== 'approved' || spec.front.approval_digest !== front.spec_approval_digest) throw new Error('approved spec inputs changed');
        binding = 'v2';
      } else if (hadBinding(cfg, target)) throw new Error('approval binding removed or downgraded; restore it or re-approve');
    } catch (error) { stale = true; binding = 'invalid'; bindingError = error.message; }
  }
  if (stale && binding === 'v2') binding = 'invalid';
  return {
    slug, kind, file: target, front, body, text, binding, bindingError,
    // Three states, and the third is the one that matters. An approved artifact whose body has
    // since changed is not a draft and is not approved; saying so is the whole point.
    state: stale ? 'stale-approval' : approved ? 'approved' : 'draft',
  };
}

// Owned paths, read from the plan and from nowhere else.
//
// The contract format duplicated this: the plan listed files by hand under `## Structure and
// ownership` while a test computed the same set from the diff, and ten of the twenty-three
// contracts were re-sealed because the hand-written list had missed something the test found.
// One source now, in the artifact a human approved.
export function ownedFiles(body) {
  const section = body.match(/^## Files\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? '';
  return [...section.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()).filter(Boolean);
}

export function behavioursOf(body) {
  return [...body.matchAll(/^### (B\d+)\b/gm)].map((m) => m[1]);
}

// One row per behaviour, keyed by id, evidence text verbatim. The same parser
// `evals/lib/campaign.mjs`'s `behavioursHaveTests` used to keep a private copy of — moved here so
// `approve()` can reach it too, and so there is one parser instead of two silently drifting apart.
export function proofRowsOf(planBody) {
  const rows = new Map();
  for (const line of planBody.split('\n')) {
    const m = line.match(/^\|\s*(B\d+)\s*\|\s*(.+?)\s*\|\s*$/);
    if (m) rows.set(m[1], m[2]);
  }
  return rows;
}

// A path a Proof row's evidence names that this check can go verify: it looks like a test file
// either by basename convention (`test_*.py`, `*.test.mjs`, `*.spec.ts`, `*_test.go`,
// `*_spec.rb`, `FooTest.java`, `FooTests.cs`, `conftest.py`, ...) or by living directly under a
// directory conventionally named for tests (`tests/`, `test/`, `spec/`, `specs/`, `__tests__/`)
// regardless of its own filename. Moved here from `evals/lib/campaign.mjs`, alongside
// `behavioursOf`/`proofRowsOf` above, so B7's commit-time check and `behavioursHaveTests` share
// one recognition instead of two copies drifting apart — review `1ace6a8` Nit 2 caught exactly
// that mistake, twice, in one week.
const TEST_BASENAME = [
  /^test[_.].+\.\w+$/i, // test_foo.py, test.foo.mjs
  /\.(test|spec)\.\w+$/i, // foo.test.mjs, foo.spec.ts
  /[_-](test|spec)s?\.\w+$/i, // foo_test.py, foo-spec.rb, foo_tests.py
  /(Test|Tests)\.\w+$/, // FooTest.java, FooTests.cs — case-sensitive, that casing IS the convention
  /^conftest\.py$/i,
];
const TEST_DIR_SEGMENT = /^(tests?|specs?|__tests__)$/i;

function looksLikeTestFile(candidate) {
  const parts = candidate.split('/');
  const base = parts.pop() || '';
  if (TEST_BASENAME.some((re) => re.test(base))) return true;
  return parts.some((seg) => TEST_DIR_SEGMENT.test(seg));
}

// The plan skill's own example, and the one real place in this repository that follows it
// (evals/fixtures/contract-planned/.../plan.md), write a path and its identifier inside one
// backtick span, joined by `::`; this repository's own plans instead backtick-quote a test
// *file* and describe the test in prose after it. Neither shape says "this identifier — not the
// file, the specific string — is what must survive," so only the file's existence is checked
// when there is no explicit `::`.
export function testRowIn(evidenceText) {
  for (const span of evidenceText.matchAll(/`([^`]+)`/g)) {
    const [candidate, identifier] = span[1].split('::');
    if (looksLikeTestFile(candidate)) return { file: candidate, identifier: identifier || null };
  }
  return null;
}

// The body of one `### <heading>` section — up to the next `##` or `###` heading, or the end of
// the text. Shared by `templateMarkers` to compare a real behaviour against the scaffold's.
function headingBody(text, heading) {
  const re = new RegExp(`^### ${heading}\\b.*$([\\s\\S]*?)(?=^### |^## |(?![\\s\\S]))`, 'm');
  return (re.exec(text)?.[1] ?? '').trim();
}

// B1: a template is not an artifact. Read from `.aidlc/templates/`, never hard-coded — `harness
// new` writes those files, so this recognises its own output rather than guessing at prose, and a
// template edited later cannot drift away from the checker (review `1ace6a8`, Nit 2, caught two
// hand-copied strings doing exactly that inside one week). Two shapes: an angle-bracket
// placeholder, verbatim, and a `### B<n>` whose body is still the scaffold's bare
// `Given ... / When ... / Then ...`. Returns the markers actually found in `body`, so a caller can
// name them in a refusal.
export function templateMarkers(kind, body) {
  const templatePath = path.join(TEMPLATES_DIR, `${kind}.md`);
  if (!existsSync(templatePath)) return [];
  // The template's body only (an-edited-approval-awaits-its-gate B7): the frontmatter comment
  // that reminds about `supersedes: <slug>#B<n>` is not a placeholder a spec has to replace.
  const templateText = parse(readFileSync(templatePath, 'utf8')).body;
  const found = [];
  for (const placeholder of new Set([...templateText.matchAll(/<[^<>]+>/g)].map((m) => m[0]))) {
    if (body.includes(placeholder)) found.push(placeholder);
  }
  const bareBehaviour = headingBody(templateText, 'B1');
  if (bareBehaviour) {
    for (const id of behavioursOf(body)) {
      if (headingBody(body, id) === bareBehaviour) {
        found.push(`### ${id} is still the scaffold's bare "${bareBehaviour.replace(/\n+/g, ' / ')}"`);
      }
    }
  }
  return found;
}

// The most recent committed version of `rel` whose body digest is `digest` — the text a human
// approved — or null when history does not hold one. Bounded to the last fifty revisions.
function approvedTextOf(cfg, rel, digest) {
  try {
    const shas = execFileSync('git', ['log', '-n', '50', '--format=%H', '--', rel], { cwd: cfg.layout.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
    for (const sha of shas) {
      const text = execFileSync('git', ['show', `${sha}:${rel}`], { cwd: cfg.layout.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      if (bodyDigest(text) === digest) return parse(text);
    }
  } catch { /* no git, or no history: nothing to compare against */ }
  return null;
}

// B1 and B2, together: what an approval refuses about an artifact's *content*, as opposed to its
// *state* above. Presence only for B2 — F11 and F15 record that every plan an agent has written
// unprompted proves its behaviours with prose rather than a resolvable test, and a plan may
// legitimately name a test it has not written yet (`a-spec-can-be-superseded`'s plan names
// `test/supersedes.test.mjs` before that change is built). Each message names the file, what is
// missing, and the fix (B3).
function contentIssues(cfg, slug, kind, front, body, target) {
  const rel = path.relative(cfg.layout.root, target);
  const issues = [];
  for (const marker of templateMarkers(kind, body)) {
    issues.push(marker.startsWith('###')
      ? `${rel}: ${marker} — replace it with the real behaviour before approving.`
      : `${rel} still carries the scaffold's placeholder ${marker} — replace it with real content before approving.`);
  }
  if (kind === 'plan') {
    const spec = read(cfg, slug, 'spec');
    if (spec) {
      const proof = proofRowsOf(body);
      const missing = behavioursOf(spec.body).filter((id) => !proof.has(id));
      if (missing.length) {
        issues.push(`${rel}'s Proof table names no row for ${missing.join(', ')} — add one row per behaviour to its ## Proof table before approving.`);
      }
    }
  }
  // B2: a `supersedes:` link is a claim about another artifact, checked the moment it becomes
  // true — the named slug must exist, its spec must be approved, and the named `### B<n>` must be
  // in it. `no-name-points-at-nothing` is the same argument for the same reason: a link to a
  // behaviour that does not exist is a typo pointing at nothing, and it fails rather than sitting
  // silently wrong.
  if (kind === 'spec') {
    // close-the-harness B4 (F35): an approved spec's promises do not grow. Run 6 of the campaign
    // added a behaviour to the previous sprint's approved spec, re-approved it, and its earlier
    // `extends:` line answered the relation gate. Compared against the committed text, the same
    // dependency `isCommitted` has; prose edits and removals stay allowed.
    // The approved text is the committed version whose body digest is the one the frontmatter
    // still carries — the edit that grew the spec is itself committed by the time approval
    // runs, so HEAD is never the comparison. Walked back through the file's history, bounded.
    const was = front.digest ? approvedTextOf(cfg, rel, front.digest) : null;
    if (was && was.front.status === 'approved') {
      const before = new Set(behavioursOf(was.body));
      const added = behavioursOf(body).filter((id) => !before.has(id));
      if (added.length) issues.push(`${rel} adds ${added.join(', ')} to a spec that was already approved — an approved spec's behaviours do not grow. Put new behaviours in a new change (harness new <slug>), which declares its relation to this one and links any behaviour it reverses.`);
    }
    // a-named-behaviour-is-a-link B1–B3. F31: an agent wrote "the contradiction with
    // add-balance-overdue#B12 … is being superseded" into the body and left the frontmatter
    // empty. The judgment was made and the id written; only the field was missed. A body that
    // names another approved spec's behaviour by exact id must link it — no inference from
    // prose, only the shape, and only against ids that exist.
    const linked = new Set(supersedesLinks(front));
    const named = new Set();
    for (const m of body.matchAll(/\b([a-z0-9][a-z0-9-]{0,62})#(B\d+)\b/g)) {
      const [id, namedSlug, behaviourId] = m;
      if (namedSlug === slug || linked.has(id) || named.has(id)) continue;
      const other = read(cfg, namedSlug, 'spec');
      if (!other || other.state !== 'approved' || !behavioursOf(other.body).includes(behaviourId)) continue;
      named.add(id);
    }
    for (const id of named) {
      issues.push(`${rel} names ${id} in its prose without linking it — add \`supersedes: ${id}\` to the frontmatter if this spec reverses that behaviour; if it is not a reversal, remove the id from the prose or refer to the behaviour by its title instead.`);
    }
    // a-change-declares-its-relation B1–B4. F33: four campaign runs, four contradictions found
    // and written into prose, no link — nothing ever asked. A spec approved beside other open
    // approved specs declares its relation to each: `supersedes:` a behaviour of it, or
    // `extends:` it. Presence only; whether `extends:` is true is the reviewer's question.
    const related = new Set([
      ...supersedesLinks(front).map((l) => l.split('#')[0]),
      ...extendsLinks(front),
    ]);
    for (const ext of extendsLinks(front)) {
      const other = read(cfg, ext, 'spec');
      if (!other) { issues.push(`${rel}: extends: ${ext} names a change with no spec.md — fix it before approving.`); continue; }
      if (other.state !== 'approved') issues.push(`${rel}: extends: ${ext} names a spec that is not approved (${other.state}) — approve ${ext}/spec.md first.`);
    }
    const unrelated = slugs(cfg).filter((other) =>
      other !== slug && !related.has(other)
      && read(cfg, other, 'intent')?.front.status !== 'closed'
      && read(cfg, other, 'spec')?.state === 'approved');
    if (unrelated.length) {
      issues.push(`${rel} says nothing about the open change${unrelated.length > 1 ? 's' : ''} ${unrelated.join(', ')} — for each, add \`supersedes: ${unrelated[0]}#B<n>\` if a behaviour here reverses one it claims, or \`extends: ${unrelated[0]}\` if all its promises still hold.`);
    }
    for (const link of supersedesLinks(front)) {
      const m = /^([a-z0-9](?:[a-z0-9-]{0,62}))#(B\d+)$/.exec(link);
      if (!m) { issues.push(`${rel}: supersedes: ${link} is not shaped <slug>#<behaviour-id> — fix it before approving.`); continue; }
      const [, namedSlug, behaviourId] = m;
      const named = read(cfg, namedSlug, 'spec');
      if (!named) { issues.push(`${rel}: supersedes: ${link} names ${namedSlug}, which has no spec.md — fix it before approving.`); continue; }
      if (named.state !== 'approved') { issues.push(`${rel}: supersedes: ${link} names a spec that is not approved (${named.state}) — approve ${namedSlug}/spec.md first.`); continue; }
      if (!behavioursOf(named.body).includes(behaviourId)) {
        issues.push(`${rel}: supersedes: ${link} names ${behaviourId}, which does not appear in ${namedSlug}/spec.md — fix it before approving.`);
      }
    }
  }
  return issues;
}

// `supersedes: <slug>#<behaviour-id>` — comma-separated for more than one link, on one line of
// frontmatter. Kept as a plain string in `front`, the same as every other frontmatter value; this
// is the one place it is split.
export function supersedesLinks(front) {
  return (front?.supersedes ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

// `extends: <slug>, <slug>` — the change whose promises all still hold under this one.
export function extendsLinks(front) {
  return (front?.extends ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

// Who points at what. Computed, never written — the same pattern `stale-approval` already is: a
// superseded spec's own file never changes, so this walks every *other* spec looking for a link
// back to it, rather than storing the fact on the file being pointed at. B5: a draft supersedes
// nothing, so only an approved superseding spec counts.
export function supersededBy(cfg) {
  const map = new Map();
  for (const slug of slugs(cfg)) {
    const spec = read(cfg, slug, 'spec');
    if (!spec || spec.state !== 'approved') continue;
    for (const link of supersedesLinks(spec.front)) {
      if (!map.has(link)) map.set(link, []);
      map.get(link).push(slug);
    }
  }
  return map;
}

// B2 (the-suite-measures-this-harness): "is this a promise the code must keep" and "may a plan
// be gated against it" are different questions, and the migration made them disagree. Twenty-
// three specs carry `migrated_from` — the digest of a contract sealed under the previous model —
// and no `status: approved`, because `lean-v2` deliberately invented no approval (its own spec,
// twice: "digests carried into frontmatter as `migrated_from`, and no approval is invented").
// Reading that as evidence of a prior sealed contract is reading the record; `approve()` staying
// `status === 'approved'`-only is refusing to invent one. A promise is `state === 'approved'`
// (not the raw frontmatter — a stale-approval spec's body changed since a human looked at it, and
// the digest mismatch says so) or `migrated_from` present; a plain draft is neither.
//
// Enumerates `cfg.layout.artifacts` directly rather than through `slugs()`: `slugs()` requires an
// `intent.md` alongside, which is a real property of every change `harness new` has ever
// scaffolded but has nothing to do with whether a spec is a promise — this answers that question
// from the spec alone.
export function promiseSpecs(cfg) {
  const root = cfg.layout.artifacts;
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => read(cfg, e.name, 'spec'))
    .filter((spec) => spec && (spec.state === 'approved' || Boolean(spec.front.migrated_from)));
}

export function slugs(cfg) {
  const root = cfg.layout.artifacts;
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(path.join(root, e.name, 'intent.md')))
    .map((e) => e.name).sort();
}

// Worktree-change-selection: the product fixture's unrelated future-report intent stopped
// hyphen-titlecase; timestamps also moved its scope. Selection is local, never an approval.
const validChangeSlug = slug => typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{0,62}$/.test(slug);
const selectionRemedy = 'select or reselect an open change with harness status --change <slug>; drafting and read-only investigation remain available';
function selectionLocation(cfg) {
  const git = (...args) => execFileSync('git', args, { cwd: cfg.layout.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const file = path.join(git('rev-parse', '--absolute-git-dir'), 'aidlc-change.json');
  let branch;
  try { branch = git('symbolic-ref', '-q', 'HEAD'); } catch { branch = `HEAD:${git('rev-parse', 'HEAD')}`; }
  return { file, branch };
}

export function selectChange(cfg, slug) {
  if (!validChangeSlug(slug)) throw new Error('change slug must be 1-63 lowercase letters, digits, or hyphens; it cannot contain paths');
  const intent = read(cfg, slug, 'intent');
  if (!intent || intent.front.status === 'closed') throw new Error(`change "${slug}" is missing or closed — ${selectionRemedy}`);
  const { file, branch } = selectionLocation(cfg);
  replaceAtomic(file, JSON.stringify({ version: 1, slug, branch }) + '\n');
  return selectionState(cfg);
}

export function clearSelection(cfg) {
  rmSync(selectionLocation(cfg).file, { force: true });
}

// Unavailable bindings are data, not exceptions: callers must never fall back to other plans.
export function selectionState(cfg) {
  let slug = null;
  const unavailable = reason => ({ slug, ok: false, reason, remedy: selectionRemedy });
  try {
    // Candidate checks may select for one invocation without writing the worktree binding.
    if (cfg.checkChange !== undefined) {
      slug = cfg.checkChange;
      if (!validChangeSlug(slug)) return unavailable('invalid change slug');
      const intent = read(cfg, slug, 'intent');
      if (!intent || intent.front.status === 'closed') return unavailable('selected change is missing or closed');
      if (cfg.diff && !isCommitted(cfg.layout.root, intent.file)) return unavailable('selected intent is not committed in the candidate');
      return { slug, ok: true };
    }
    const { file, branch } = selectionLocation(cfg);
    let binding;
    try { binding = JSON.parse(readFileSync(file, 'utf8')); }
    catch (error) { return unavailable(error.code === 'ENOENT' ? 'no selection in this worktree' : 'selection is unreadable or malformed'); }
    if (!binding || binding.version !== 1 || !validChangeSlug(binding.slug) || typeof binding.branch !== 'string') return unavailable('invalid selection');
    slug = binding.slug;
    if (binding.branch !== branch) return unavailable(`selection belongs to ${binding.branch}, not this branch/HEAD (${branch})`);
    const intent = read(cfg, slug, 'intent');
    if (!intent) return unavailable('selected change is missing');
    if (intent.front.status === 'closed') return unavailable('selected change is closed');
    if (cfg.diff && !isCommitted(cfg.layout.root, intent.file)) return unavailable('selected intent is not committed in the candidate');
    return { slug, ok: true, branch };
  } catch { return unavailable('cannot resolve selection in this Git worktree'); }
}

export function currentChange(cfg) {
  const selection = selectionState(cfg);
  if (!selection.ok) return null;
  const { slug } = selection;
  try {
    const spec = read(cfg, slug, 'spec');
    const plan = read(cfg, slug, 'plan');
    const gateState = artifact => !artifact ? 'absent' : artifact.state === 'approved' && !isCommitted(cfg.layout.root, artifact.file) ? 'uncommitted' : artifact.state;
    const specState = gateState(spec), planState = gateState(plan);
    return { slug, at: spec?.front.at ?? null, specState, planState,
      plan: specState === 'approved' && planState === 'approved' ? { slug, file: plan.file, owns: ownedFiles(plan.body) } : null };
  } catch { return { slug, specState: 'unreadable', planState: 'unreadable', plan: null }; }
}

// Only the selected change awaits an execution gate. Backlog state remains visible via state().
export function draftsAwaitingGate(cfg) {
  const current = currentChange(cfg);
  if (!current) return [];
  const { slug, specState, planState } = current;
  const spec = specState === 'draft' ? read(cfg, slug, 'spec') : null;
  const unwritten = specState === 'absent' || (spec && templateMarkers('spec', spec.body).length > 0);
  if (specState !== 'approved') return [{ slug, kind: 'spec', reason: specState === 'stale-approval' ? 'stale' : unwritten ? 'unwritten' : specState }];
  if (planState === 'stale-approval') return [{ slug, kind: 'plan', reason: 'stale' }];
  return [];
}

// One wording for what a waiting entry is and how it is cleared, shared by the guard, the check
// and the two reporters.
export function awaitingGateLine(entry) {
  const gate = entry.kind === 'plan' ? 2 : 1;
  const what = entry.reason === 'uncommitted' ? `${entry.kind} approval not committed`
    : entry.reason === 'unreadable' ? `${entry.kind} unreadable`
    : entry.reason === 'stale' ? `${entry.kind} edited after approval`
    : entry.reason === 'unwritten' ? 'intent written, spec not yet'
      : 'spec written and not approved';
  return `awaiting gate ${gate}: ${entry.slug} (${what})`;
}
export function awaitingGateRemedy(entry) {
  const approve = `harness approve ${entry.slug} ${entry.kind} --by <you>`;
  if (entry.reason === 'uncommitted') return `${entry.slug}/${entry.kind}.md approval is not committed. Commit the approved artifact before product writes.`;
  if (entry.reason === 'unreadable') return `restore readable artifacts for ${entry.slug} and verify its approvals before product writes.`;
  if (entry.reason === 'unwritten') {
    return `the change "${entry.slug}" has a written intent and no spec yet. Write its spec, approve it (${approve}) and its plan, and commit; or close the change (status: closed in its intent.md).`;
  }
  if (entry.reason === 'stale') {
    return `${entry.slug}/${entry.kind}.md was edited after it was approved. Re-approve it (${approve}) and commit, or restore the approved text; a reversal of an approved behaviour belongs in a new change with \`supersedes:\`, not in an edit to the old one.`;
  }
  return `the change "${entry.slug}" has a written spec that awaits gate 1. Approve it (${approve}) and commit, or close the change (status: closed in its intent.md).`;
}

// At most one plan, from the explicitly selected change with both committed gates intact.
export function governingPlans(cfg) {
  const current = currentChange(cfg);
  return current?.plan ? [current.plan] : [];
}

// B6. One wording for `harness status` and `SessionStart`, so the two cannot drift apart.
export function currentLine(cfg) {
  const current = currentChange(cfg);
  if (!current) {
    const selected = selectionState(cfg);
    return `current: ${selected.slug ?? 'none'} — ${selected.reason}; ${selected.remedy}`;
  }
  const lines = [];
  if (current.plan) lines.push(`current: ${current.slug} (plan approved) — only its ## Files may change`);
  else if (current.specState !== 'approved') lines.push(`current: ${current.slug} — spec not approved (${current.specState}); product writes are refused`);
  else {
    const remedy = current.planState === 'uncommitted' ? 'commit its plan approval'
      : `write or restore its plan, approve it (harness approve ${current.slug} plan --by <you>) and commit`;
    lines.push(`current: ${current.slug} — plan not approved (${current.planState}); ${remedy}, or close the change and select the next`);
  }
  for (const entry of draftsAwaitingGate(cfg)) lines.push(`${awaitingGateLine(entry)} — ${awaitingGateRemedy(entry)}`);
  return lines.join('\n');
}

// What `status` prints, and what a session resumes from.
export function state(cfg, slug) {
  const artifacts = Object.fromEntries(KINDS.map((kind) => [kind, read(cfg, slug, kind)]));
  const issues = [];
  for (const kind of GATED) {
    if (artifacts[kind]?.state === 'stale-approval') issues.push(`${kind}.md changed after it was approved — re-approve it or restore the approved text`);
  }
  const plan = artifacts.plan;
  if (plan?.state === 'approved' && !ownedFiles(plan.body).length) issues.push('plan.md declares no files under "## Files"');

  // `closed` is what a delivered change looks like afterwards. Without it the twenty-three
  // changes this repository has already shipped sat on the board forever waiting for a spec
  // approval nobody was going to give, and a board that is mostly noise is a board nobody reads.
  const closed = artifacts.intent?.front.status === 'closed';

  const next = closed ? 'closed'
    : !artifacts.intent ? 'intent'
      : artifacts.spec?.state !== 'approved' ? 'spec approval'
        : artifacts.plan?.state !== 'approved' ? 'plan approval'
          : artifacts.review?.front.status === 'approved' ? 'merge'
            : 'implement';

  return { slug, next, closed, issues: closed ? [] : issues, ok: closed || issues.length === 0, artifacts };
}
