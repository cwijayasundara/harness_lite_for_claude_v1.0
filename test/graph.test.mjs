// Law 7: the graph answers five named questions, proven by a test that asks them.
//
// This file was written before the producer existed. That ordering is the whole point — v6's
// graph was fresh, cheap, correctly synced, and answering about the wrong tree, because
// nothing ever asked it a question with a known answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { A, ROOT } from './_paths.mjs';
import { build, query, fingerprint } from '../.aidlc/lib/graph.mjs';
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

// code-property-graph B1, step 1. The edges were implicit in `raw_imports` and `symbols`, which
// is why nothing could ask for one kind and get only that kind. They are emitted explicitly and
// additively: the fields every consumer already reads are untouched, so this is a widening.
test('B1 — the index carries typed edges, and an answer names the type that produced it', () => {
  const s = stage(FIXTURES, 'graph-app');
  try {
    const g = graphOf(s.work);

    // The contract is what `query` answers, not how the edges are stored — they are grouped by
    // source module on disk so a path is written once rather than once per edge.
    assert.ok(g.edges, 'the index carries an edge list');
    for (const type of ['import', 'call', 'co-edit']) assert.ok(g.edges[type], `${type} edges are present`);

    const imports = query(g, 'edges', 'import');
    assert.ok(imports.length > 0, 'the fixture has import edges');
    assert.ok(imports.every((e) => e.type === 'import'), 'one type requested, one type returned');
    // An import edge is file -> file, and both ends are modules the index knows.
    for (const e of imports) {
      assert.ok(g.modules[e.from], `${e.from} is a known module`);
      assert.ok(g.modules[e.to], `${e.to} is a known module`);
    }
    // It agrees with the field it was derived from, so the widening cannot drift from it.
    const fromField = Object.entries(g.modules).flatMap(([rel, m]) => m.imports.map((to) => `${rel}->${to}`)).sort();
    assert.deepEqual(imports.map((e) => `${e.from}->${e.to}`).sort(), fromField);

    const calls = query(g, 'edges', 'call');
    assert.ok(calls.length > 0, 'the fixture has call edges');
    assert.ok(calls.every((e) => e.type === 'call'), 'one type requested, one type returned');
    // A call edge is function -> function. An unknown callee is a builtin or a method, not an
    // edge — the same filter Q2 applies, so the two cannot disagree.
    const names = new Set(Object.values(g.modules).flatMap((m) => m.symbols.map((sym) => sym.name)));
    for (const e of calls) {
      assert.ok(names.has(e.to), `${e.to} is a known symbol`);
      assert.ok(g.modules[e.from.module], `${e.from.module} is a known module`);
    }
    assert.deepEqual(
      [...new Set(calls.filter((e) => e.from.symbol === 'place_order').map((e) => e.to))].sort(),
      query(g, 'calls', 'place_order').sort(),
      'the call edge list and Q2 answer the same question the same way');

    assert.throws(() => query(g, 'edges', 'nonsense'), /edge type/, 'an unknown edge type is refused, not silently empty');
  } finally { s.cleanup(); }
});

// code-property-graph B2, step 2. `.filter((x) => x)` dropped every specifier that resolved to
// nothing, so a build could fail to resolve half a tree and report exactly the same as a clean one.
test('B2 — the build reports what it could not resolve, what is ambiguous, and what it collapsed', () => {
  const s = stage(FIXTURES, 'graph-app');
  try {
    // A path-shaped import that goes nowhere, and a duplicate of one that goes somewhere.
    const target = path.join(s.work, 'web', 'client.js');
    writeFileSync(target, `import { missing } from './nowhere.js';\n${readFileSync(target, 'utf8')}`);
    const g = graphOf(s.work);
    const a = query(g, 'audit');

    assert.ok(a.counts, 'the audit reports counts');
    assert.ok(Array.isArray(a.unresolved), 'and the list behind them');
    const miss = a.unresolved.find((u) => u.specifier === './nowhere.js');
    assert.ok(miss, 'a project-shaped import that resolves to nothing is recorded, not dropped');
    assert.equal(miss.module, 'web/client.js');
    assert.equal(a.counts.unresolved, a.unresolved.length, 'the count and the list agree');

    // A bare specifier is external, counted rather than listed — otherwise node: and every
    // package would bury the few misses that are actually actionable.
    assert.ok(a.counts.external >= 0);
    assert.ok(!a.unresolved.some((u) => /^node:/.test(u.specifier)), 'externals are not listed as misses');

    // Ambiguity is reported by name with every module that defines it.
    assert.equal(a.counts.ambiguous, a.ambiguous.length, 'the count and the list agree');
    for (const row of a.ambiguous) assert.ok(row.modules.length > 1, `${row.name} is only ambiguous across modules`);

    // Each edge appears once.
    const calls = query(g, 'edges', 'call').map((e) => `${e.from.module}:${e.from.symbol}->${e.to}`);
    assert.equal(calls.length, new Set(calls).size, 'no duplicate call edges survive');
    const imports = query(g, 'edges', 'import').map((e) => `${e.from}->${e.to}`);
    assert.equal(imports.length, new Set(imports).size, 'no duplicate import edges survive');
  } finally { s.cleanup(); }
});

// the-index-tracks-the-source B1. The audit made the composition visible: 451 of this
// repository's 543 indexed modules were the harness's own output. Ranking those would have made
// the hubs line worse than the metric it replaces.
test('B1 — the harness does not index its own output, and a project exclude still works', () => {
  const s = stage(FIXTURES, 'graph-app');
  try {
    const write = (rel, body) => {
      mkdirSync(path.join(s.work, path.dirname(rel)), { recursive: true });
      writeFileSync(path.join(s.work, rel), body);
    };
    write('.aidlc/evals/comparisons/run-1/product/src/ledger.mjs', 'export function addCustomer() {}\n');
    write('.aidlc/evals/products/run-2/src/ledger.mjs', 'export function addCustomer() {}\n');
    write('.claude/worktrees/agent-1/.aidlc/lib/graph.mjs', 'export function build() {}\n');
    // Hand-written reproduction scripts under artifacts are source and stay.
    write('.aidlc/artifacts/some-change/reproduce.mjs', 'export function reproduce() {}\n');
    // A project's own exclusion is honoured alongside the harness's, not replaced by it.
    write('vendor/thing.mjs', 'export function vendored() {}\n');

    const g = build({ graph: { include: ['.', '.claude'], exclude: ['vendor'] }, layout: { root: s.work } });
    const mods = Object.keys(g.modules);

    for (const gone of ['.aidlc/evals/', '.claude/worktrees/']) {
      assert.equal(mods.filter((m) => m.startsWith(gone)).length, 0, `${gone} is not indexed as source`);
    }
    assert.ok(mods.includes('.aidlc/artifacts/some-change/reproduce.mjs'), 'artifact scripts are source');
    assert.equal(mods.filter((m) => m.startsWith('vendor/')).length, 0, "a project's own exclude still applies");
    assert.ok(mods.includes('src/app/service.py'), 'real source is still indexed');

    // The ambiguity the audit reports is a real collision, not one file copied into run records.
    const a = query(g, 'audit');
    assert.ok(!a.ambiguous.some((r) => r.modules.some((m) => m.startsWith('.aidlc/evals/'))),
      'recorded run copies no longer manufacture ambiguity');
  } finally { s.cleanup(); }
});

// B2. fingerprint() hashed paths and contents only, so a commit moved the co-edit weights while
// refresh() reported `clean` and nothing in the loop could see it.
// B3 and B5. The approved behaviour is stated at `refresh()` — "it does not report clean" — and
// was proven one layer below it by comparing two `fingerprint()` values. It is asserted at the
// boundary now. The git helper also carries the `-c commit.gpgsign=false` that stage.mjs passes
// deliberately, and checks status, so a refused commit reports itself instead of surfacing later
// as an assertion about production code.
test('B3 — a commit with no working-tree change moves the fingerprint and refresh does not report clean', async () => {
  const { refresh } = await import('../.aidlc/lib/refresh.mjs');
  const s = stage(FIXTURES, 'graph-app');
  try {
    const state = path.join(s.work, '.aidlc', 'state');
    mkdirSync(state, { recursive: true });
    const cfg = { graph: { include: ['.'], exclude: [] },
      layout: { root: s.work, state, graph: path.join(state, 'graph.json'),
        graphDirty: path.join(state, 'graph-dirty.jsonl'), ledger: path.join(state, 'ledger.jsonl'),
        runId: path.join(state, 'run-id') } };

    const git = (...args) => {
      const r = spawnSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd: s.work, encoding: 'utf8' });
      assert.equal(r.status, 0, `git ${args[0]} failed: ${r.stderr || r.stdout}`);
      return r;
    };
    // stage() already initialised and committed this fixture, so only the identity is set here.
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');

    const before = fingerprint(cfg);
    assert.equal(refresh(cfg).skipped, undefined, 'the first refresh builds');
    assert.equal(refresh(cfg).skipped, 'clean', 'an unchanged tree at an unchanged commit is clean');

    git('commit', '-q', '--allow-empty', '-m', 'a commit that changes no file');

    assert.notEqual(fingerprint(cfg), before, 'history moved, so the index identity moved');
    assert.notEqual(refresh(cfg).skipped, 'clean',
      'refresh must rebuild across a commit — co-edit weights derive from history, not from files');
  } finally { s.cleanup(); }
});

// the-gate-grades-what-it-can-measure B2. The previous version of this test used `stage()`, which
// git-initialises and commits every fixture — so `headCommit()` always succeeded, the empty
// component was never reached, and `typeof === 'string'` was true before the change too. It could
// not fail, and stood in for an approved safeguard.
test('B2 — no git and no commit both reach the empty component, and a commit changes the value', () => {
  const dirs = [];
  const make = (body) => {
    const d = mkdtempSync(path.join(tmpdir(), 'graph-fp-'));
    dirs.push(d);
    writeFileSync(path.join(d, 'a.mjs'), body);
    return { root: d, cfg: { graph: { include: ['.'], exclude: [] }, layout: { root: d } } };
  };
  try {
    const SRC = 'export function only() { return 1; }\n';
    const noGit = make(SRC);
    const noCommit = make(SRC);
    const committed = make(SRC);

    const git = (root, ...args) => {
      const r = spawnSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8' });
      assert.equal(r.status, 0, `git ${args[0]} failed: ${r.stderr}`);
    };
    git(noCommit.root, 'init', '-q');
    git(committed.root, 'init', '-q');
    git(committed.root, 'config', 'user.email', 't@t');
    git(committed.root, 'config', 'user.name', 't');
    git(committed.root, 'add', '-A');
    git(committed.root, 'commit', '-qm', 'first');

    // Identical trees, so any difference is the commit component and nothing else.
    assert.equal(fingerprint(noGit.cfg), fingerprint(noCommit.cfg),
      'no git and no commit both degrade to the same empty component');
    assert.notEqual(fingerprint(committed.cfg), fingerprint(noGit.cfg),
      'a repository with a commit fingerprints differently — the component is real, not decorative');
  } finally { for (const d of dirs) rmSync(d, { recursive: true, force: true }); }
});

// B3. Not new code so much as three existing properties that must survive the two changes above,
// because between them they are what stops a stale index from ever being a confident wrong answer.
test('B3 — a stale index is a miss, and a rank never outlives the modules it ranks', async () => {
  const { save, load } = await import('../.aidlc/lib/graph.mjs');
  const s = stage(FIXTURES, 'graph-app');
  try {
    const state = path.join(s.work, '.aidlc', 'state');
    mkdirSync(state, { recursive: true });
    const cfg = { graph: { include: ['.'], exclude: [] },
      layout: { root: s.work, state, graph: path.join(state, 'graph.json') } };

    const g = build(cfg);
    save(cfg, g);
    assert.ok(load(cfg), 'a current index loads');

    // Change the tree. The stored fingerprint no longer matches, so the index is absent rather
    // than served — the caller falls back to search instead of trusting a stale answer.
    writeFileSync(path.join(s.work, 'web', 'util.js'), 'export function brandNew() {}\n');
    assert.equal(load(cfg), null, 'a stale index is a miss, not a wrong answer');

    // A global property is produced by the same build as the modules it summarises, so it cannot
    // describe a module set that build did not have.
    const rebuilt = build(cfg);
    const known = new Set(Object.keys(rebuilt.modules));
    for (const row of query(rebuilt, 'audit').ambiguous) {
      for (const m of row.modules) assert.ok(known.has(m), `${m} is in the same build that reported it`);
    }
    for (const e of query(rebuilt, 'edges', 'import')) assert.ok(known.has(e.from) && known.has(e.to));
  } finally { s.cleanup(); }
});

// code-property-graph B3, step 3 — anchor. `format` is exported by two modules in this fixture,
// and the fixture exists because of it: a lookup that stops at the first match answers the wrong
// question. Resolution uses the resolved import edges already computed, and no type inference.
test('B3 — a reference resolves to the definition its call site reaches, or says it cannot', () => {
  const s = stage(FIXTURES, 'retrieval-app');
  try {
    const invoices = 'src/billing/invoices.mjs';
    const summary = 'src/reporting/summary.mjs';
    // A module that imports exactly one of the two definers.
    writeFileSync(path.join(s.work, 'src', 'billing', 'receipt.mjs'),
      "import { format } from './invoices.mjs';\n\nexport function receiptLine(cents) {\n  return format(cents);\n}\n");
    const g = graphOf(s.work);

    // Defined in the calling module: that one wins, and the ambiguity is still reported.
    const local = query(g, 'definition', 'format', { from: summary });
    assert.equal(local.resolved, summary, 'a local definition is the one the call site reaches');
    assert.equal(local.ambiguous, true, 'the bare name is still ambiguous across the app');
    assert.deepEqual(local.candidates.sort(), [invoices, summary]);

    // Imported from exactly one definer: that one wins.
    const imported = query(g, 'definition', 'format', { from: 'src/billing/receipt.mjs' });
    assert.equal(imported.resolved, invoices, 'the imported definer is the one the call site reaches');
    assert.equal(imported.ambiguous, true);

    // Imports both: it says it cannot decide and hands back the candidates rather than picking.
    const both = query(g, 'definition', 'format', { from: 'src/index.mjs' });
    assert.equal(both.resolved, null, 'no guess where the reference genuinely cannot be resolved');
    assert.deepEqual(both.candidates.sort(), [invoices, summary]);

    // An unambiguous name resolves and says so.
    const single = query(g, 'definition', 'rollup', { from: 'src/index.mjs' });
    assert.equal(single.resolved, 'src/reporting/aggregate.mjs');
    assert.equal(single.ambiguous, false);

    // A name nothing defines is a miss, not an invention.
    assert.equal(query(g, 'definition', 'nosuchsymbol', { from: 'src/index.mjs' }).resolved, null);
  } finally { s.cleanup(); }
});

// code-property-graph B4, step 4 — co-edit. Structure cannot express "these change together".
// The pair below has no import and no call edge between them and still moves as a unit.
test('B4 — files that change together carry a weighted edge structure cannot express', () => {
  const cfg = { graph: { include: ['.', '.claude'], exclude: ['node_modules', '.venv', 'dist', '.git', '__pycache__'] },
    layout: { root: ROOT } };
  const g = build(cfg);
  const A = 'test/guard.test.mjs', B = 'test/lifecycle-cli.test.mjs';

  const edge = query(g, 'edges', 'co-edit').find((e) => (e.from === A && e.to === B) || (e.from === B && e.to === A));
  assert.ok(edge, 'the pair co-changes and the index says so');
  assert.ok(edge.weight > 1, 'the weight reflects how often, not merely whether');
  assert.equal(edge.type, 'co-edit');

  // The point of the edge: no structural relation joins these two.
  const structural = query(g, 'edges', 'import').some((e) => (e.from === A && e.to === B) || (e.from === B && e.to === A));
  assert.equal(structural, false, 'no import edge joins them — this is the signal structure misses');

  // Each pair once, on its lexicographically smaller end, and both ends are indexed modules.
  const seen = new Set();
  for (const e of query(g, 'edges', 'co-edit')) {
    assert.ok(e.from < e.to, 'pairs are canonical, so an edge is never stored twice');
    const key = `${e.from}\0${e.to}`;
    assert.ok(!seen.has(key), 'no duplicate co-edit pairs');
    seen.add(key);
    assert.ok(g.modules[e.from] && g.modules[e.to], 'both ends are modules the index knows');
  }
});

// A tree that arrives in one initial commit has every file "changing with" every other exactly
// once. The file-count cap cannot see that at small scale, so the weight threshold is what stops
// a single commit from being read as total coupling.
test('B4 — one shared commit is a coincidence, not a clique', () => {
  const s = stage(FIXTURES, 'graph-app');
  try {
    const g = graphOf(s.work);
    assert.deepEqual(query(g, 'edges', 'co-edit'), [], 'a single co-occurrence is not coupling');
    // Every other question is unaffected, so the edge type degrades to absent rather than wrong.
    assert.deepEqual(query(g, 'calls', 'place_order').sort(), ['find_user', 'save_order']);
    assert.ok(query(g, 'edges', 'import').length > 0);
    assert.ok(Object.keys(g.modules).length > 0);
  } finally { s.cleanup(); }
});

test('B4 — no git at all still builds, with no co-edit edges and no recorded head', () => {
  const work = mkdtempSync(path.join(tmpdir(), 'graph-nogit-'));
  try {
    writeFileSync(path.join(work, 'a.mjs'), "import { b } from './b.mjs';\nexport function a() { return b(); }\n");
    writeFileSync(path.join(work, 'b.mjs'), 'export function b() { return 1; }\n');
    const g = build({ graph: { include: ['.'], exclude: [] }, layout: { root: work } });
    assert.deepEqual(query(g, 'edges', 'co-edit'), [], 'absent, not wrong');
    assert.equal(g.head, '', 'no commit to record');
    assert.equal(query(g, 'edges', 'import').length, 1, 'structure is unaffected by the absence of history');
  } finally { rmSync(work, { recursive: true, force: true }); }
});

// B4. The safeguard that stops 451 removed modules becoming confident "not found" answers. The
// plan booked it and nothing asserted it.
test('B4 — a symbol in an excluded path is a miss that names search, not an absence', async () => {
  const { pack, renderPack } = await import('../.aidlc/lib/pack.mjs');
  const s = stage(FIXTURES, 'graph-app');
  try {
    mkdirSync(path.join(s.work, '.aidlc', 'evals', 'comparisons', 'run-1'), { recursive: true });
    writeFileSync(path.join(s.work, '.aidlc/evals/comparisons/run-1/ledger.mjs'),
      'export function onlyInAnExcludedPath() { return 1; }\n');
    const cfg = { graph: { include: ['.', '.claude'], exclude: [] }, layout: { root: s.work } };
    const g = build(cfg);

    assert.equal(Object.keys(g.modules).some((m) => m.startsWith('.aidlc/evals/')), false,
      'the excluded path is not indexed, which is the premise of this test');

    const rendered = renderPack(pack(cfg, g, 'onlyInAnExcludedPath', { budget: 1200 }));
    assert.match(rendered, /no graph entry/i, 'the answer is a miss');
    assert.match(rendered, /grep|search/i, 'and it names search as the next step');
    assert.doesNotMatch(rendered, /does not exist|not found in the codebase/i,
      'a miss is never a claim of absence');
  } finally { s.cleanup(); }
});

// B6. `only` bypasses discover()/walk(), so the exclusions were not applied on that path.
test('B6 — an incremental rebuild applies the same exclusions as a full one', () => {
  const s = stage(FIXTURES, 'graph-app');
  try {
    const rel = '.aidlc/evals/comparisons/run-1/ledger.mjs';
    mkdirSync(path.join(s.work, path.dirname(rel)), { recursive: true });
    writeFileSync(path.join(s.work, rel), 'export function shouldNotBeIndexed() { return 1; }\n');
    const cfg = { graph: { include: ['.', '.claude'], exclude: [] }, layout: { root: s.work } };
    const full = build(cfg);
    const incremental = build(cfg, { only: [rel], previous: full });
    assert.equal(incremental.modules[rel], undefined,
      'an incremental rebuild naming an excluded path must not index it');
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
