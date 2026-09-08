import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as a from '../.aidlc/lib/artifacts.mjs';
import { layout } from '../.aidlc/lib/paths.mjs';

// Migration baseline: approval declarations and closure never depend on a delivery index.
test('item 5 migration preserves approval-time links and historical bytes', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'context-migration-'));
  const cfg = { layout: layout(root) };
  try {
    for (const slug of ['original', 'proposal']) {
      mkdirSync(a.dir(cfg, slug), { recursive: true });
      const body = '# Spec\n\n### B1\n\nA rule.\n';
      writeFileSync(a.file(cfg, slug, 'spec'), a.render({ status: 'approved', digest: a.bodyDigest(body), ...(slug === 'proposal' ? { supersedes: 'original#B1' } : {}) }, body));
      writeFileSync(a.file(cfg, slug, 'intent'), a.render({ status: 'closed' }, '# Intent\n'));
    }
    const before = readFileSync(a.file(cfg, 'original', 'spec'), 'utf8');
    assert.deepEqual(a.supersededBy(cfg).get('original#B1'), ['proposal']);
    assert.equal(readFileSync(a.file(cfg, 'original', 'spec'), 'utf8'), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

import { productFixture } from './_product-context-fixture.mjs';
import { productContext, revisionPack, renderProduct, withSnapshot } from '../.aidlc/lib/product-context.mjs';
import { BIN } from './_paths.mjs';
const view = (f, revision = 'HEAD', records = 'HEAD') => productContext(f.cfg, { revision, records });
const row = (v, slug) => v.changes.find(c => c.change === slug);
const behaviour = (v, slug) => v.behaviours.find(b => b.id === `${slug}#B1`);
function delivered(f, slug = 'original', options) { const c = f.prepare(slug, options); f.code(); return f.record(c); }

test('exact delivered revision, source, unsigned host policy and absent execution remain distinct', () => {
  const f = productFixture();
  try {
    const d = delivered(f);
    const v = view(f, d.merge);
    assert.equal(v.unavailable, undefined);
    assert.equal(v.revision, d.merge);
    assert.equal(v.records, d.catalog);
    assert.equal(row(v, 'original').state, 'recorded-delivered');
    assert.equal(row(v, 'original').source.revision, f.source);
    assert.equal(row(v, 'original').host.verified, false);
    assert.equal(row(v, 'original').host.provenance, 'simulated-transport');
    assert.equal(behaviour(v, 'original').state, 'effective');
    assert.equal(behaviour(v, 'original').execution, 'not-executed');
    assert(row(v, 'original').code.every(f => f.matches_requested));
    assert.match(renderProduct(v), /not deployment/);
    f.write('.aidlc/artifacts/original/delivery.json', '{}');
    assert.deepEqual(view(f, d.merge), v, 'dirty catalog does not change committed truth');
    assert.equal(row(view(f, d.base), 'original').state, 'not-delivered-at-revision');
    assert.throws(() => view(f, '--all'), /requires --revision/);
  } finally { f.cleanup(); }
});

test('pending reversal never retires a delivered rule; integrated reversal and refactor retain source', () => {
  const f = productFixture();
  try {
    const original = delivered(f);
    const before = readFileSync(a.file(f.cfg, 'original', 'spec'), 'utf8');
    const reversal = f.prepare('reversal', { supersedes: 'original#B1' });
    assert.equal(behaviour(view(f), 'original').state, 'effective');
    assert.equal(row(view(f), 'reversal').state, 'delivery-unknown');
    f.code('Mary-jane Watson');
    const r = f.record(reversal);
    assert.equal(behaviour(view(f), 'original').state, 'historical');
    assert.equal(behaviour(view(f), 'reversal').state, 'effective');
    assert.equal(behaviour(view(f, original.merge), 'original').state, 'effective');
    const refactor = f.prepare('refactor', { extends: 'reversal', files: ['src/app/text.py', 'src/app/names.py', 'tests/test_rule.py'], design: 'Move formatting implementation to names.py; preserve the public wrapper.' });
    f.write('src/app/names.py', 'def format_name(value):\n    return "Mary-jane Watson"\n');
    f.commit('Product refactor'); f.record(refactor);
    const v = view(f);
    assert.equal(behaviour(v, 'reversal').state, 'effective');
    assert.equal(row(v, 'refactor').source.revision, f.source);
    assert.match(row(v, 'refactor').design, /names.py/);
    assert.equal(readFileSync(a.file(f.cfg, 'original', 'spec'), 'utf8'), before);
    const p = revisionPack(f.cfg, 'titlecase', { revision: r.merge, budget: 2000 });
    assert.equal(p.revision, r.merge);
    assert(p.relevant_changes.includes('reversal'));
    assert(p.relevant_changes.includes('original'));
    assert(p.tokens <= 2000);
    assert(p.included.some(i => i.kind === 'definition' && i.text.includes('Mary-jane')));
  } finally { f.cleanup(); }
});

test('deleted records and current spec links retain committed delivery history; edits are ambiguous', () => {
  const f = productFixture();
  try {
    delivered(f);
    delivered(f, 'reversal', { supersedes: 'original#B1' });
    const record = '.aidlc/artifacts/reversal/delivery.json';
    f.git('rm', record); f.git('rm', '.aidlc/artifacts/reversal/spec.md'); f.commit('Remove current navigation links');
    let v = view(f);
    assert.equal(row(v, 'reversal').state, 'recorded-delivered');
    assert.equal(behaviour(v, 'original').state, 'historical');
    assert(v.findings.some(f => f.code === 'deleted-record'));
    const originalRecord = '.aidlc/artifacts/original/delivery.json';
    const r = JSON.parse(readFileSync(path.join(f.root, originalRecord), 'utf8'));
    r.pr = 999;
    f.write(originalRecord, JSON.stringify(r)); f.commit('Conflicting record identity');
    v = view(f);
    assert(v.findings.some(f => f.code === 'conflicting-records'));
    assert(!v.changes.some(c => c.change === 'original' && c.state === 'recorded-delivered'));
  } finally { f.cleanup(); }
});

test('competing replacements remain unresolved until a delivered change replaces both', () => {
  const f = productFixture();
  try {
    delivered(f);
    delivered(f, 'first', { supersedes: 'original#B1' });
    delivered(f, 'second', { supersedes: 'original#B1' });
    let v = view(f);
    assert.equal(behaviour(v, 'original').state, 'unresolved');
    assert.equal(behaviour(v, 'first').state, 'unresolved');
    assert.equal(behaviour(v, 'second').state, 'unresolved');
    delivered(f, 'resolution', { supersedes: 'first#B1, second#B1' });
    v = view(f);
    assert.equal(behaviour(v, 'original').state, 'historical');
    assert.equal(behaviour(v, 'resolution').state, 'effective');
    assert(!v.findings.some(f => f.code === 'competing-replacements'));
  } finally { f.cleanup(); }
});

test('merge differences require fresh integrated evidence, including modes and deletion endpoints', () => {
  const f = productFixture();
  try {
    const c = f.prepare('original');
    const candidate = f.code();
    f.write('src/app/text.py', 'def titlecase(value):\n    return "changed during integration"\n');
    const merge = f.commit('Integration conflict resolution');
    f.record(c, { candidate, merge });
    const r = row(view(f), 'original');
    assert.equal(r.state, 'integration-evidence-required');
    assert.deepEqual(r.merge_mismatches, ['src/app/text.py']);
  } finally { f.cleanup(); }
});

test('fresh integrated report supports changed merge without borrowing old proof', () => {
  const f = productFixture();
  try {
    const c = f.prepare('original'); const candidate = f.code();
    f.write('src/app/text.py', 'def titlecase(value):\n    return value\n');
    const merge = f.commit('Integration implementation');
    f.write('.aidlc/artifacts/original/integrated.json', JSON.stringify(f.report(c, merge)));
    f.record(c, { candidate, merge, recordEdit: r => { r.integrated_checks = '.aidlc/artifacts/original/integrated.json'; } });
    assert.equal(row(view(f), 'original').state, 'recorded-delivered');
    assert.equal(behaviour(view(f), 'original').execution, 'not-executed');
  } finally { f.cleanup(); }
});

for (const [name, options, expected] of [
  ['host not merged', { hostEdit: h => { h.host.state = 'OPEN'; } }, /host merge/],
  ['host wrong candidate', { hostEdit: h => { h.candidate = 'a'.repeat(40); } }, /host merge/],
  ['unsafe report path', { recordEdit: r => { r.checks = '../outside.json'; } }, /schema/],
  ['missing report', { recordEdit: r => { r.checks = 'missing.json'; } }, /missing/],
]) test(name + ' cannot establish delivery', () => {
  const f = productFixture();
  try {
    const c = f.prepare('original'); f.code(); f.record(c, options);
    const r = row(view(f), 'original');
    assert.equal(r.state, 'delivery-unavailable');
    assert.match(r.diagnostics.join(' '), expected);
    assert.equal(view(f).behaviours.length, 0);
  } finally { f.cleanup(); }
});

test('failed checks and exact passed/skipped execution are separately exposed', () => {
  const f = productFixture();
  try {
    const c = f.prepare('original'); f.code();
    const controls = [{ control: 'scope-drift', verdict: 'pass' }, { control: 'test', verdict: 'fail', execution: { status: 'observed', exitcode: 1, tests: [{ nodeid: 'tests/test_rule.py::test_rule', outcome: 'failed' }] } }];
    f.record(c, { controls });
    const v = view(f);
    assert.equal(row(v, 'original').state, 'recorded-delivered');
    assert.equal(row(v, 'original').checks.state, 'failed');
    assert.equal(behaviour(v, 'original').execution, 'failed');
  } finally { f.cleanup(); }
});

test('forged trace identity is refused and historical packs ignore dirty source', () => {
  const f = productFixture();
  try {
    const c = f.prepare('original'); const candidate = f.code();
    const report = f.report(c, candidate); report.trace.source.revision = 'wrong';
    f.record(c, { checkReport: report });
    assert.match(row(view(f), 'original').diagnostics.join(' '), /trace/);
    f.write('src/app/text.py', 'def evil():\n    return "dirty"\n');
    const p = revisionPack(f.cfg, 'titlecase', { revision: candidate, budget: 8 });
    assert(p.tokens <= 8); assert(p.omitted.length > 0);
    const missing = revisionPack(f.cfg, 'unsupported_symbol', { revision: candidate });
    assert.equal(missing.hit, false);
    assert.match(missing.fallback, /git grep/);
    assert.equal(f.git('branch', '--show-current').length > 0, true);
    assert.equal(readFileSync(path.join(f.root, 'src/app/text.py'), 'utf8').includes('dirty'), true);
  } finally { f.cleanup(); }
});

test('closed pending work stays unknown and does not retire delivered behavior', () => {
  const f = productFixture();
  try {
    delivered(f);
    f.prepare('canceled', { supersedes: 'original#B1' });
    const intent = a.read(f.cfg, 'canceled', 'intent');
    f.write('.aidlc/artifacts/canceled/intent.md', a.render({ ...intent.front, status: 'closed' }, intent.body));
    f.commit('Cancel proposal');
    const v = view(f);
    assert.equal(row(v, 'canceled').closed, true);
    assert.equal(behaviour(v, 'original').state, 'effective');
    assert.equal(a.currentChange(f.cfg), null);
  } finally { f.cleanup(); }
});

test('CLI requires exact revision options and emits matching text/JSON context', () => {
  const f = productFixture();
  try {
    const d = delivered(f);
    const cli = (...args) => execFileSync(process.execPath, [BIN, ...args], { cwd: f.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const data = JSON.parse(cli('graph', 'query', 'product', '--revision', d.merge, '--json'));
    assert.equal(data.revision, d.merge);
    assert.match(cli('graph', 'query', 'product', '--revision', d.merge), /recorded-delivered/);
    assert.throws(() => cli('graph', 'query', 'product'), /requires --revision/);
    assert.throws(() => cli('graph', 'query', 'product', '--revision', d.merge, '--revision', d.merge), /duplicate/);
    assert.throws(() => cli('pack', 'titlecase', '--records', 'HEAD'), /requires --revision/);
    assert.equal(JSON.parse(cli('pack', 'titlecase', '--revision', d.merge, '--json')).revision, d.merge);
  } finally { f.cleanup(); }
});

test('cycles and missing delivered targets do not produce unique effective truth', () => {
  const f = productFixture();
  try {
    const first = f.prepare('first');
    const second = f.prepare('second', { supersedes: 'first#B1' });
    const spec = a.read(f.cfg, 'first', 'spec');
    f.write('.aidlc/artifacts/first/spec.md', a.render({ ...spec.front, status: 'draft', supersedes: 'second#B1' }, spec.body));
    f.commit('Simulated cyclic requirement correction');
    a.approve(f.cfg, 'first', 'spec', { by: 'simulated-fixture-reviewer' });
    a.approve(f.cfg, 'first', 'plan', { by: 'simulated-fixture-reviewer' });
    f.commit('Simulated corrected approvals');
    const candidate = f.code();
    f.record(first, { candidate });
    assert(view(f).findings.some(f => f.code === 'missing-supersession-target'));
    f.record(second, { candidate });
    const v = view(f);
    assert(v.findings.some(f => f.code === 'supersession-cycle'));
    assert(v.behaviours.every(b => b.state === 'unresolved'));
  } finally { f.cleanup(); }
});

test('symlink evidence is refused and snapshot materialization never follows symlinks', async () => {
  const { symlinkSync, existsSync } = await import('node:fs');
  const f = productFixture();
  try {
    const c = f.prepare('original'); f.code();
    symlinkSync('/etc/passwd', path.join(f.root, 'host.json'));
    f.record(c, { recordEdit: r => { r.host_review = 'host.json'; } });
    assert.match(row(view(f), 'original').diagnostics.join(' '), /non-regular/);
    withSnapshot(f.root, f.git('rev-parse', 'HEAD'), (cfg, excluded) => {
      assert(excluded.includes('host.json'));
      assert(!existsSync(path.join(cfg.layout.root, 'host.json')));
    });
  } finally { f.cleanup(); }
});

test('catalog ref excludes later records and shallow histories report unavailable', () => {
  const f = productFixture();
  const target = mkdtempSync(path.join(tmpdir(), 'context-shallow-'));
  try {
    const d = delivered(f);
    assert.equal(row(view(f, d.merge, d.candidate), 'original').state, 'delivery-unknown');
    execFileSync('git', ['clone', '--depth=1', `file://${f.root}`, path.join(target, 'repo')], { stdio: 'pipe' });
    const shallow = productContext({ layout: layout(path.join(target, 'repo')) }, { revision: 'HEAD' });
    assert.match(shallow.unavailable, /shallow history/);
  } finally { f.cleanup(); rmSync(target, { recursive: true, force: true }); }
});

test('mode changes and rename/deletion endpoints are compared at merge', () => {
  const f = productFixture();
  try {
    const first = delivered(f);
    const c = f.prepare('rename', { extends: 'original', files: ['src/app/text.py', 'src/app/names.py', 'tests/test_rule.py'] });
    f.git('mv', 'src/app/text.py', 'src/app/names.py');
    const candidate = f.commit('Rename implementation');
    f.write('src/app/text.py', 'def obsolete(value):\n    return value\n');
    f.git('update-index', '--chmod=+x', 'src/app/names.py');
    // commit() stages the worktree; chmod the actual file too so its mode remains changed.
    execFileSync('chmod', ['+x', path.join(f.root, 'src/app/names.py')]);
    const merge = f.commit('Merge changes mode and resurrects old endpoint');
    f.record(c, { candidate, merge });
    const r = row(view(f), 'rename');
    assert.equal(r.state, 'integration-evidence-required');
    assert.deepEqual(r.merge_mismatches.sort(), ['src/app/names.py', 'src/app/text.py']);
    assert.equal(behaviour(view(f, first.merge), 'original').state, 'effective');
  } finally { f.cleanup(); }
});

test('unbound legacy gates are retained without inventing bound delivery authority', () => {
  const f = productFixture();
  try {
    const slug = 'legacy';
    mkdirSync(a.dir(f.cfg, slug), { recursive: true });
    f.write('.aidlc/artifacts/legacy/intent.md', a.render({ status: 'closed' }, '# Historical intent\n'));
    const body = '# Spec\n\n### B1\n\nRender a name.\n';
    f.write('.aidlc/artifacts/legacy/spec.md', a.render({ status: 'approved', digest: a.bodyDigest(body) }, body));
    const plan = '# Plan\n\n## Files\n\n- `src/app/text.py`\n\n## Proof\n\n| Behaviour | Test or evidence |\n|---|---|\n| B1 | tests/test_rule.py |\n';
    f.write('.aidlc/artifacts/legacy/plan.md', a.render({ status: 'approved', digest: a.bodyDigest(plan), spec_digest: a.bodyDigest(body) }, plan));
    const base = f.git('rev-parse', 'HEAD'); f.code();
    f.record({ slug, base });
    assert.equal(row(view(f), slug).state, 'delivery-unbound');
    assert.equal(view(f).behaviours.length, 0);
  } finally { f.cleanup(); }
});

test('partial clones refuse offline context before any object retrieval', () => {
  const f = productFixture();
  try {
    f.git('config', 'remote.unavailable.promisor', 'true');
    assert.throws(() => view(f), /partial clone/);
  } finally { f.cleanup(); }
});

test('catalog history includes discarded record variants on reachable merged branches', () => {
  const f = productFixture();
  try {
    delivered(f);
    const main = f.git('branch', '--show-current');
    f.git('checkout', '-qb', 'conflicting-record');
    const file = '.aidlc/artifacts/original/delivery.json';
    const r = JSON.parse(readFileSync(path.join(f.root, file), 'utf8')); r.pr = 500;
    f.write(file, JSON.stringify(r)); f.commit('Conflicting observation on side branch');
    f.git('checkout', '-q', main);
    assert(!view(f).findings.some(f => f.code === 'conflicting-records'), 'unmerged side branch is excluded');
    f.commit('Advance catalog branch');
    f.git('-c', 'commit.gpgsign=false', 'merge', '--no-ff', '-s', 'ours', '-qm', 'Retain original catalog tree', 'conflicting-record');
    assert(view(f).findings.some(f => f.code === 'conflicting-records'), 'reachable discarded history remains visible');
  } finally { f.cleanup(); }
});

test('replacement integrated before its target is unresolved instead of timestamp ordered', () => {
  const f = productFixture();
  try {
    const original = f.prepare('original'); const candidate = f.code();
    const reversal = f.prepare('reversal', { supersedes: 'original#B1' }); f.code();
    f.record(reversal);
    const laterOriginalMerge = f.git('rev-parse', 'HEAD');
    f.record(original, { candidate, merge: laterOriginalMerge });
    const v = view(f);
    assert(v.findings.some(f => f.code === 'supersession-order-unresolved'));
    assert(v.behaviours.every(b => b.state === 'unresolved'));
  } finally { f.cleanup(); }
});
