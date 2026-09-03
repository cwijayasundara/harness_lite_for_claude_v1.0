import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gate, update, readRecord, writeRecord, loadResults, RECORD_SCHEMA } from '../.aidlc/lib/eval-gate.mjs';

const record = (tasks) => ({ schema: RECORD_SCHEMA, recorded_at: '2026-09-01T00:00:00.000Z', source: 'r.json', commit: null, tasks });
const results = (pairs) => ({
  source: 'now.json',
  summary: { total: Object.keys(pairs).length, pass: Object.values(pairs).filter((v) => v === 'pass').length },
  results: Object.entries(pairs).map(([id, verdict]) => ({ id, verdict })),
});

function tmp() {
  const root = mkdtempSync(path.join(tmpdir(), 'eval-gate-'));
  return { root, dir: path.join(root, 'results'), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

// B1. The whole point: a task that used to pass and now does not must stop the merge.
test('a recorded pass that now fails is a regression', () => {
  const r = gate(results({ 'surgical-fix': 'fail', 'honest-failure': 'pass' }), record({ 'surgical-fix': 'pass', 'honest-failure': 'pass' }));
  assert.equal(r.ok, false);
  assert.deepEqual(r.regressed.map((x) => x.id), ['surgical-fix']);
});

// B1, second half. run.mjs: "Flaky is not green." The gate must agree with the runner.
test('flaky is a regression, not a pass', () => {
  const r = gate(results({ 'surgical-fix': 'flaky' }), record({ 'surgical-fix': 'pass' }));
  assert.equal(r.ok, false);
  assert.deepEqual(r.regressed.map((x) => x.id), ['surgical-fix']);
});

// B2.
test('every expected task passing is a pass', () => {
  const r = gate(results({ a: 'pass', b: 'pass' }), record({ a: 'pass', b: 'pass' }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.regressed, []);
});

// B3. A known-failing task is allowed to keep failing; fixing it is reported, not demanded.
test('a recorded failure that now passes is an improvement, and does not block', () => {
  const r = gate(results({ a: 'pass', b: 'pass' }), record({ a: 'pass', b: 'fail' }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.improved.map((x) => x.id), ['b']);
  assert.deepEqual(r.regressed, [], 'an improvement is not a regression');
});

// B4. Five tasks were renamed in 303b58b and the aggregate score never moved. A check that only
// walks the intersection of the two sets cannot see that, so both directions are findings.
test('a recorded task missing from the run blocks', () => {
  const r = gate(results({ a: 'pass' }), record({ a: 'pass', b: 'pass' }));
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['b']);
});

test('a graded task absent from the record blocks', () => {
  const r = gate(results({ a: 'pass', 'renamed-task': 'pass' }), record({ a: 'pass' }));
  assert.equal(r.ok, false);
  assert.deepEqual(r.unrecorded, ['renamed-task']);
});

// B5. The ratchet. A baseline you can lower to make a run green is a fixture edited to make a
// test pass, and evals/fixtures/ is write-protected for exactly that reason.
test('update refuses to lower a recorded task', () => {
  assert.throws(
    () => update(record({ a: 'pass' }), results({ a: 'fail' })),
    /refusing to lower a/,
  );
});

// B6. A task nobody could grade has no state to record. Writing `inconclusive` into the record
// would make the next comparison meaningless in both directions.
test('update refuses to record an inconclusive task', () => {
  assert.throws(
    () => update(record({ a: 'pass' }), results({ a: 'pass', b: 'inconclusive' })),
    /refusing to record b .*inconclusive/,
  );
});

test('update records an improvement and a newly added task', () => {
  const next = update(record({ a: 'pass', b: 'fail' }), results({ a: 'pass', b: 'pass', c: 'fail' }), { commit: 'abc123', at: '2026-09-02T00:00:00.000Z' });
  assert.equal(next.schema, RECORD_SCHEMA);
  assert.deepEqual(next.tasks, { a: 'pass', b: 'pass', c: 'fail' });
  assert.equal(next.commit, 'abc123');
});

// B6. Silence is never a pass — the same rule as "An empty suite is not a pass" (6496934).
test('no results and no record both fail closed', () => {
  const noResults = gate(null, record({ a: 'pass' }));
  assert.equal(noResults.ok, false);
  assert.match(noResults.reason, /no eval results/);

  const noRecord = gate(results({ a: 'pass' }), null);
  assert.equal(noRecord.ok, false);
  assert.match(noRecord.reason, /no expectation record/);
});

test('loadResults returns null for an empty or absent results directory', () => {
  const f = tmp(); try {
    assert.equal(loadResults(f.dir), null, 'absent directory');
    mkdirSync(f.dir, { recursive: true });
    assert.equal(loadResults(f.dir), null, 'empty directory');
    writeFileSync(path.join(f.dir, 'a.json'), '{ not json');
    assert.equal(loadResults(f.dir), null, 'unreadable results are skipped, not thrown');
  } finally { f.cleanup(); }
});

// The widest run wins, so a three-task smoke cannot displace a full suite as the graded run.
test('loadResults prefers the widest run, then the newest', () => {
  const f = tmp(); try {
    mkdirSync(f.dir, { recursive: true });
    writeFileSync(path.join(f.dir, '2026-01-01.json'), JSON.stringify(results({ a: 'pass', b: 'pass', c: 'pass' })));
    writeFileSync(path.join(f.dir, '2026-02-01.json'), JSON.stringify(results({ a: 'pass' })));
    assert.equal(loadResults(f.dir).source, '2026-01-01.json', 'a later smoke run must not displace a wider one');
  } finally { f.cleanup(); }
});

// overlay-narrow-eval-runs B1-B6. Without the overlay an inconclusive task can only be repaired
// by re-running the whole suite, because a one-task results file loses the widest-run tie-break.
function results_dir(files) {
  const f = tmp();
  mkdirSync(f.dir, { recursive: true });
  for (const [name, pairs] of Object.entries(files)) writeFileSync(path.join(f.dir, name), JSON.stringify(results(pairs)));
  return f;
}

test('a later narrow run corrects one task and leaves the rest of the widest run alone', () => {
  const f = results_dir({
    '2026-09-02T04.json': { a: 'pass', b: 'inconclusive', c: 'fail' },
    '2026-09-02T09.json': { b: 'pass' },
  }); try {
    const out = loadResults(f.dir);
    const by = Object.fromEntries(out.results.map((r) => [r.id, r.verdict]));
    assert.deepEqual(by, { a: 'pass', b: 'pass', c: 'fail' }, 'only b moves');
    assert.equal(out.source, '2026-09-02T04.json', 'the widest run is still the base');
    // B2
    assert.deepEqual(out.sources, ['2026-09-02T04.json', '2026-09-02T09.json'], 'oldest first');
  } finally { f.cleanup(); }
});

test('an older narrow run is ignored — overlays move forward only', () => {
  const f = results_dir({
    '2026-09-02T01.json': { b: 'pass' },
    '2026-09-02T04.json': { a: 'pass', b: 'inconclusive' },
  }); try {
    const out = loadResults(f.dir);
    assert.equal(out.results.find((r) => r.id === 'b').verdict, 'inconclusive', 'a stale verdict must not be revived');
    assert.deepEqual(out.sources, ['2026-09-02T04.json']);
  } finally { f.cleanup(); }
});

test('a narrow run cannot introduce a task the widest run never graded', () => {
  const f = results_dir({
    '2026-09-02T04.json': { a: 'pass', b: 'pass', c: 'pass' },
    '2026-09-02T09.json': { a: 'pass', 'sneaked-in': 'pass' },
  }); try {
    const out = loadResults(f.dir);
    assert.deepEqual(out.results.map((r) => r.id).sort(), ['a', 'b', 'c'], 'the graded set is set by a full run');
    assert.deepEqual(out.sources, ['2026-09-02T04.json'], 'a run that corrected nothing is not a source');
  } finally { f.cleanup(); }
});

test('a task still inconclusive after the overlay still refuses to record', () => {
  const f = results_dir({
    '2026-09-02T04.json': { a: 'pass', b: 'inconclusive' },
    '2026-09-02T09.json': { b: 'inconclusive' },
  }); try {
    assert.throws(() => update(record({ a: 'pass' }), loadResults(f.dir)), /refusing to record b/);
  } finally { f.cleanup(); }
});

test('a lone widest run behaves exactly as before, with one source', () => {
  const f = results_dir({ '2026-09-02T04.json': { a: 'pass', b: 'fail' } }); try {
    const out = loadResults(f.dir);
    assert.deepEqual(Object.fromEntries(out.results.map((r) => [r.id, r.verdict])), { a: 'pass', b: 'fail' });
    assert.deepEqual(out.sources, ['2026-09-02T04.json']);
    const next = update(null, out, { at: '2026-09-02T00:00:00.000Z' });
    assert.deepEqual(next.sources, ['2026-09-02T04.json']);
  } finally { f.cleanup(); }
});

// one-eval-number B1/B3/B4/B5. The board read the widest run alone while the gate overlaid later
// narrow runs, so status said 18/22 and the gate said 22/22 — one quantity, two answers. A board
// that disagrees with its gate teaches people to trust neither, and the board is what gets read
// first.
test('the board and the gate read the results the same way', async () => {
  const indicators = await import('../.aidlc/lib/indicators.mjs');
  const evalGate = await import('../.aidlc/lib/eval-gate.mjs');
  // B5: one implementation. The gate re-exports the indicator's reader rather than owning a copy.
  assert.equal(evalGate.loadResults, indicators.loadResults, 'two readers will agree today and drift tomorrow');

  const f = results_dir({
    '2026-09-02T04.json': { a: 'pass', b: 'fail', c: 'pass' },
    '2026-09-02T09.json': { b: 'pass' },
  }); try {
    // B1: the correction reaches both.
    const merged = indicators.loadResults(f.dir);
    assert.equal(merged.summary.pass, 3, 'the later run repaired b');
    assert.deepEqual(indicators.verdicts(merged).get('b'), 'pass');

    // B3: a narrower later run corrects verdicts; it does not become the score.
    assert.equal(merged.summary.total, 3, 'the widest run still sets the denominator');
  } finally { f.cleanup(); }
});

test('with no results the board reads unmeasured', async () => {
  const { loadResults } = await import('../.aidlc/lib/indicators.mjs');
  const f = tmp(); try {
    assert.equal(loadResults(f.dir), null, 'absent directory');
    mkdirSync(f.dir, { recursive: true });
    assert.equal(loadResults(f.dir), null, 'empty directory');
  } finally { f.cleanup(); }
});

test('readRecord rejects a file with the wrong schema', () => {
  const f = tmp(); try {
    mkdirSync(f.root, { recursive: true });
    const file = path.join(f.root, 'expected.json');
    writeRecord(file, { schema: 'something-else', tasks: {} });
    assert.throws(() => readRecord(file), /schema must be/);
    assert.equal(readRecord(path.join(f.root, 'absent.json')), null);
  } finally { f.cleanup(); }
});
