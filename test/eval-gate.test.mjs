import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gate, update, readRecord, writeRecord, loadResults, RECORD_SCHEMA } from '../.aidlc/lib/eval-gate.mjs';

const record = (tasks) => ({ schema: RECORD_SCHEMA, recorded_at: '2026-09-01T00:00:00.000Z', source: 'r.json', commit: null, tasks });
const norm = (v) => (typeof v === 'string' ? { verdict: v } : v);
const results = (pairs) => ({
  source: 'now.json',
  summary: { total: Object.keys(pairs).length, pass: Object.values(pairs).filter((v) => norm(v).verdict === 'pass').length },
  results: Object.entries(pairs).map(([id, v]) => ({ id, verdict: norm(v).verdict, usd: norm(v).usd })),
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
  assert.deepEqual(next.tasks, { a: { verdict: 'pass', usd: null }, b: { verdict: 'pass', usd: null }, c: { verdict: 'fail', usd: null } });
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
test('readRecord rejects a file with the wrong schema', () => {
  const f = tmp(); try {
    mkdirSync(f.root, { recursive: true });
    const file = path.join(f.root, 'expected.json');
    writeRecord(file, { schema: 'something-else', tasks: {} });
    assert.throws(() => readRecord(file), /schema must be/);
    assert.equal(readRecord(path.join(f.root, 'absent.json')), null);
  } finally { f.cleanup(); }
});

// lean-v2 cut 10. The cost ratchets are gone; usd is recorded and never compared. What survives
// is the property they were bolted onto: a v1 record, written before cost existed, still loads.
test('a record written before cost was tracked still loads, and usd is data not a gate', () => {
  const v1 = { schema: 'aidlc.eval-expectation/v1', tasks: { a: 'pass' } };
  const results = { results: [{ id: 'a', verdict: 'pass', usd: 99 }] };
  const result = gate(results, v1);
  assert.equal(result.ok, true, 'a task that got dearer is not a regression');
  assert.equal(result.regressed.length, 0);

  const record = update(v1, results);
  assert.equal(record.tasks.a.verdict, 'pass');
  assert.equal(record.tasks.a.usd, 99, 'the newest observation is recorded, not a floor');
});
