// Law 7: the graph answers five named questions, proven by a test that asks them.
//
// This file was written before the producer existed. That ordering is the whole point — v6's
// graph was fresh, cheap, correctly synced, and answering about the wrong tree, because
// nothing ever asked it a question with a known answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { A, ROOT } from './_paths.mjs';
import { build, query } from '../.aidlc/lib/graph.mjs';
import { stage } from '../evals/lib/stage.mjs';

const FIXTURES = path.join(ROOT, 'evals', 'fixtures');
const CFG = { graph: { include: ['.', '.claude'], exclude: ['node_modules', '.venv', 'dist', '.git', '__pycache__'] } };

function graphOf(work) {
  return build({ ...CFG, layout: { root: work } });
}

test('Q1 — who calls this symbol', () => {
  const s = stage(FIXTURES, 'graph-app');
  try {
    const g = graphOf(s.work);
    // Test callers are INCLUDED, deliberately. An agent asking "who calls place_order" before
    // changing it needs the tests most of all. (Hub ranking is the opposite case — see Q3.)
    assert.deepEqual(query(g, 'callers', 'place_order').map((h) => h.id).sort(),
      ['src/app/api.py:handle', 'tests/test_service.py:test_place_order']);
    assert.deepEqual(query(g, 'callers', 'find_user').map((h) => h.id).sort(),
      ['src/app/service.py:place_order']);
    assert.deepEqual(query(g, 'callers', 'slugify').map((h) => h.id).sort(),
      ['web/client.js:linkFor']);
  } finally { s.cleanup(); }
});

test('Q2 — what does this symbol call', () => {
  const s = stage(FIXTURES, 'graph-app');
  try {
    const g = graphOf(s.work);
    assert.deepEqual(query(g, 'calls', 'place_order').sort(), ['find_user', 'save_order']);
    assert.deepEqual(query(g, 'calls', 'handle').sort(), ['greet', 'place_order']);
    assert.deepEqual(query(g, 'calls', 'whoami').sort(), []);
  } finally { s.cleanup(); }
});

test('Q3 — what are the hubs', () => {
  const s = stage(FIXTURES, 'graph-app');
  try {
    const g = graphOf(s.work);
    const hubs = query(g, 'hubs');
    assert.equal(hubs[0].module, 'src/app/models.py', 'models is imported by repo, service and api');
    assert.equal(hubs[0].fan_in, 3);
    // The fixture's own tests import service; that must not be mistaken for production coupling.
    assert.ok(hubs.every((h) => !h.module.startsWith('tests/')), 'test helpers are not hubs');
  } finally { s.cleanup(); }
});

test('Q4 — what cycles exist', () => {
  const s = stage(FIXTURES, 'graph-app');
  try {
    const cycles = query(graphOf(s.work), 'cycles');
    assert.equal(cycles.length, 1);
    assert.deepEqual([...cycles[0]].sort(), ['src/app/cycle_a.py', 'src/app/cycle_b.py']);
  } finally { s.cleanup(); }
});

test('Q5 — what changed under this symbol since a ref', () => {
  const s = stage(FIXTURES, 'graph-app');
  try {
    const f = path.join(s.work, 'src/app/service.py');
    writeFileSync(f, readFileSync(f, 'utf8').replace('    user = find_user(name)', '    user = find_user(name.strip())'));
    const g = graphOf(s.work);
    const changed = query(g, 'changed-since', 'HEAD', { root: s.work });
    assert.deepEqual(changed.map((c) => c.symbol), ['place_order']);
    assert.equal(changed[0].module, 'src/app/service.py');
  } finally { s.cleanup(); }
});

// The regression test for v6's actual defect: a one-line dotdir filter made 48k LOC of harness
// invisible to its own graph, and the committed wiki's top hubs were test helpers.
test('the harness is visible to its own graph', () => {
  const g = build({ ...CFG, layout: { root: A } });
  const modules = Object.keys(g.modules);
  assert.ok(modules.includes('lib/runner.mjs'), 'the runner must be in the graph');
  assert.ok(modules.includes('hooks/dispatch.mjs'), 'the hook dispatcher must be in the graph');
  assert.ok(query(g, 'callers', 'normalize').length > 0, 'cross-file calls inside .claude resolve');
});

test('a missing graph is a miss, not a crash — the agent falls back and says so', () => {
  const s = stage(FIXTURES, 'clean-app');
  try {
    const r = spawnSync('node', [path.join(A, 'bin', 'harness'), 'graph', 'query', 'callers', 'nothing_here'],
      { cwd: s.work, encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.match(`${r.stdout}${r.stderr}`, /(no match|grep)/i);
  } finally { s.cleanup(); }
});

test('pack: a budget is a budget, and what does not fit is named', async () => {
  const { pack } = await import('../.aidlc/lib/pack.mjs');
  const s = stage(FIXTURES, 'graph-app');
  try {
    const cfg = { ...CFG, layout: { root: s.work } };
    const g = build(cfg);
    const wide = pack(cfg, g, 'place_order', { budget: 1200 });
    assert.ok(wide.hit);
    assert.ok(wide.included.some((p) => p.kind === 'definition' && p.module === 'src/app/service.py'));
    assert.ok(wide.tokens <= 1200);

    const tight = pack(cfg, g, 'place_order', { budget: 30 });
    assert.ok(tight.tokens <= 30, 'the budget is not advisory');
    assert.ok(tight.omitted.length > 0, 'dropped pieces are named, never silently truncated');
    // The definition outranks callers, so a tight budget keeps the thing you actually asked for.
    assert.equal(tight.included[0]?.kind, 'definition');
  } finally { s.cleanup(); }
});

test('pack: a miss tells the caller to grep instead of implying absence', async () => {
  const { pack, renderPack } = await import('../.aidlc/lib/pack.mjs');
  const s = stage(FIXTURES, 'graph-app');
  try {
    const cfg = { ...CFG, layout: { root: s.work } };
    const r = pack(cfg, build(cfg), 'no_such_symbol_anywhere');
    assert.equal(r.hit, false);
    assert.match(renderPack(r), /grep -rn/);
  } finally { s.cleanup(); }
});

test('refresh: builds on a cold clone rather than returning quietly', async () => {
  const { refresh } = await import('../.aidlc/lib/refresh.mjs');
  const { existsSync: ex, mkdirSync: mk, appendFileSync: af } = await import('node:fs');
  const s = stage(FIXTURES, 'graph-app');
  try {
    const state = path.join(s.work, '.aidlc/state');
    mk(state, { recursive: true });
    const cfg = { ...CFG, layout: {
      root: s.work, state, graph: path.join(state, 'graph.json'),
      graphDirty: path.join(state, 'graph-dirty.jsonl'), ledger: path.join(state, 'ledger.jsonl'),
      runId: path.join(state, 'run-id'),
    } };
    af(cfg.layout.graphDirty, JSON.stringify({ file: 'src/app/service.py' }) + '\n');
    // v6's equivalent bailed here because the meta file was gitignored, so the graph only ever
    // advanced on the one machine where someone had run the builder by hand.
    const r = refresh(cfg);
    assert.ok(r.modules > 0, `expected a build, got ${JSON.stringify(r)}`);
    assert.ok(ex(cfg.layout.graph));
    // lean-v2 cut 9 removed the rendered wiki. `harness map` writes one CODEBASE-MAP.md with a
    // drift sensor behind it (B11); until then the graph is the artifact refresh produces.
    assert.equal(readFileSync(cfg.layout.graphDirty, 'utf8'), '', 'the dirty list is drained');
    assert.equal(refresh(cfg).skipped, 'clean', 'a second pass with nothing dirty does no work');
  } finally { s.cleanup(); }
});

test('the pack benchmark meets Phase 3 exit criterion', async () => {
  const { bench } = await import('../evals/bench/pack-bench.mjs');
  const r = bench();
  assert.ok(r.recall >= 0.9, `recall ${r.recall}`);
  // lean-v2 B11 raised this floor from 0.5 to 0.9. The measured figure is 0.965 — 3,397 tokens
  // against 97,995 — and that number is the entire reason the index is kept rather than deleted
  // in favour of Explore and grep. A claim that carries a subsystem has to be defended by a test
  // set near it, not by a bound loose enough that halving the benefit would still pass.
  assert.ok(r.reduction >= 0.9, `token reduction ${r.reduction} — the graph must earn its place`);
});

test('the refresh lock releases by truncation, because unlink is not always available', async () => {
  const { refresh } = await import('../.aidlc/lib/refresh.mjs');
  const { mkdirSync: mk, writeFileSync: wf, statSync: st } = await import('node:fs');
  const s = stage(FIXTURES, 'graph-app');
  try {
    const state = path.join(s.work, '.aidlc/state');
    mk(state, { recursive: true });
    const cfg = { ...CFG, layout: {
      root: s.work, state, graph: path.join(state, 'graph.json'),
      graphDirty: path.join(state, 'graph-dirty.jsonl'), ledger: path.join(state, 'ledger.jsonl'),
      runId: path.join(state, 'run-id'),
    } };
    refresh(cfg, { force: true });
    assert.equal(st(path.join(state, 'graph.lock')).size, 0, 'released locks are empty, not absent');

    // A live lock from another process is respected.
    wf(path.join(state, 'graph.lock'), '99999');
    assert.equal(refresh(cfg, { force: true }).skipped, 'locked');
  } finally { s.cleanup(); }
});

test('an empty whole-graph answer is an answer; an empty symbol answer is a miss', () => {
  const bin = path.join(A, 'bin', 'harness');
  const s = stage(FIXTURES, 'clean-app');
  try {
    const run = (...a) => spawnSync('node', [bin, 'graph', 'query', ...a], { cwd: s.work, encoding: 'utf8' }).stdout;
    // clean-app has no cycles. That is a fact, not a cache miss, and must not send anyone to grep.
    assert.match(run('cycles'), /^none —/m);
    assert.doesNotMatch(run('cycles'), /grep/);
    // A symbol nobody defines might still exist; the graph must not claim otherwise.
    assert.match(run('callers', 'ghost_symbol'), /grep -rn "ghost_symbol"/);
  } finally { s.cleanup(); }
});

// lean-v2 B11. The index was measured at 90% recall and a 96.5% token reduction and nothing had
// ever used it, because nothing said it existed and nothing kept it current: `graph-refresh`
// recorded 57 invocations and zero fires, which is what a control that can only pass looks like.
test('map: one budgeted page, and drift is a verdict rather than a marker file', async () => {
  const codemap = await import('../.aidlc/lib/map.mjs');
  const graph = await import('../.aidlc/lib/graph.mjs');
  const fs = await import('node:fs');
  const s = stage(FIXTURES, 'graph-app');
  try {
    const cfg = { ...CFG, layout: { root: s.work, state: path.join(s.work, '.aidlc/state') } };
    const g = graph.build(cfg);

    const body = codemap.render(g);
    assert.ok(body.split('\n').length <= codemap.MAX_LINES, 'the map must stay inside its budget');
    assert.match(body, /^# Codebase map$/m);
    assert.match(body, /harness graph query callers/, 'the map tells a reader to ask the index first');

    // Never written: drifted, and the reason says so rather than reading as a mismatch.
    const missing = codemap.drift(cfg, g);
    assert.equal(missing.drifted, true);
    assert.match(missing.reason, /never been written/);

    codemap.write(cfg, g);
    assert.equal(codemap.drift(cfg, g).drifted, false, 'a map just written cannot be stale');

    // A hub disappears from the tree. The committed map still names it, which is exactly the
    // failure that left the index answering `renderWiki` from a file deleted four commits before.
    const hub = graph.query(g, 'hubs', null, { limit: 1 })[0];
    fs.rmSync(path.join(s.work, hub.module));
    const after = graph.build(cfg);
    const drifted = codemap.drift(cfg, after);
    assert.equal(drifted.drifted, true, 'a deleted hub must drift the map');
    assert.ok(drifted.gone.includes(hub.module), `the diff names what went: ${JSON.stringify(drifted.gone)}`);

    // And the two lines SessionStart pays for on every session.
    const lines = codemap.summary(cfg, after);
    assert.equal(lines.length, 2);
    assert.match(lines[0], /CODEBASE-MAP\.md/);
  } finally { s.cleanup(); }
});
