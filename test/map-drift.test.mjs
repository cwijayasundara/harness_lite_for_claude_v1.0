// every-control-fires-or-goes B5. `map-drift` fired on 86 of 86 Stops: CODEBASE-MAP.md was last
// written on 2026-09-03, the Stop hook only ever *said* to run `harness map`, and nobody did —
// the F6 shape, an instruction that waits to be followed. A control that fires every time
// measures nothing. Reproduce first: a fresh map, a Stop, and the recorded verdict.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { BIN, ROOT } from './_paths.mjs';
import { stage } from '../evals/lib/stage.mjs';
import { run as scopeDrift } from '../.aidlc/checks/scope-drift.mjs';

const FIXTURES = path.join(ROOT, 'evals', 'fixtures');

function stop(work) {
  mkdirSync(path.join(work, '.aidlc/state'), { recursive: true });
  appendFileSync(path.join(work, '.aidlc/state/graph-dirty.jsonl'), JSON.stringify({ ts: Date.now(), file: 'web/util.js' }) + '\n');
  const r = spawnSync(process.execPath, [BIN, 'hook', 'stop'], { cwd: work, encoding: 'utf8', input: JSON.stringify({ cwd: work, hook_event_name: 'Stop' }) });
  assert.equal(r.status, 0, r.stderr);
  const rows = readFileSync(path.join(work, '.aidlc/state/ledger.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return rows.filter((row) => row.control === 'map-drift').pop();
}

test('map-drift passes after a fresh map, fails after a structural edit, and the map is current afterwards', () => {
  const s = stage(FIXTURES, 'graph-app');
  try {
    assert.equal(spawnSync(process.execPath, [BIN, 'map'], { cwd: s.work, encoding: 'utf8' }).status, 0);
    assert.equal(stop(s.work).verdict, 'pass', 'a map written moments ago is not stale');

    appendFileSync(path.join(s.work, 'web/util.js'), '\nexport function brandNew() { return 1; }\n');
    const drifted = stop(s.work);
    assert.equal(drifted.verdict, 'fail', 'the tree changed shape and the map did not');
    assert.equal(drifted.rule, 'stale-map');
    // The Stop that found the drift also repaired it, so the next Stop is honest again and a
    // stale map never outlives the session that made it stale.
    assert.match(readFileSync(path.join(s.work, 'CODEBASE-MAP.md'), 'utf8'), /brandNew|util\.js/);
    assert.equal(stop(s.work).verdict, 'pass');
  } finally { s.cleanup(); }
});

// The Stop hook regenerating the map means the map changes in a working copy no plan claims.
// It is harness output, like `.aidlc/state/`, and scope-drift must not report it.
test('a regenerated CODEBASE-MAP.md is not scope drift', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    writeFileSync(path.join(s.work, 'CODEBASE-MAP.md'), '# Codebase map\n');
    const r = await scopeDrift({ layout: { root: s.work, artifacts: path.join(s.work, '.aidlc/artifacts') } });
    assert.equal(r.verdict, 'pass', JSON.stringify(r.findings));
  } finally { s.cleanup(); }
});

test('a repository whose map has never been written is drifted, and Stop writes the first one', () => {
  const s = stage(FIXTURES, 'graph-app');
  try {
    assert.equal(spawnSync(process.execPath, [BIN, 'graph', 'build'], { cwd: s.work, encoding: 'utf8' }).status, 0);
    assert.ok(!existsSync(path.join(s.work, 'CODEBASE-MAP.md')));
    assert.equal(stop(s.work).verdict, 'fail');
    assert.ok(existsSync(path.join(s.work, 'CODEBASE-MAP.md')));
    assert.equal(stop(s.work).verdict, 'pass');
  } finally { s.cleanup(); }
});
