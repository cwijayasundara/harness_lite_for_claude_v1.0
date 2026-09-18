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
import { run as scopeDrift } from '../.claude/harness/checks/scope-drift.mjs';

const FIXTURES = path.join(ROOT, 'evals', 'fixtures');

function stop(work) {
  mkdirSync(path.join(work, '.claude/harness/state'), { recursive: true });
  appendFileSync(path.join(work, '.claude/harness/state/graph-dirty.jsonl'), JSON.stringify({ ts: Date.now(), file: 'web/util.js' }) + '\n');
  const r = spawnSync(process.execPath, [BIN, 'hook', 'stop'], { cwd: work, encoding: 'utf8', input: JSON.stringify({ cwd: work, hook_event_name: 'Stop' }) });
  assert.equal(r.status, 0, r.stderr);
  const rows = readFileSync(path.join(work, '.claude/harness/state/ledger.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return rows.filter((row) => row.control === 'map-drift').pop();
}

test('Stop does not rebuild or grade the optional code map', () => {
  const s = stage(FIXTURES, 'graph-app');
  try {
    assert.equal(spawnSync(process.execPath, [BIN, 'map'], { cwd: s.work, encoding: 'utf8' }).status, 0);
    const before = readFileSync(path.join(s.work, 'CODEBASE-MAP.md'), 'utf8');
    appendFileSync(path.join(s.work, 'web/util.js'), '\nexport function brandNew() { return 1; }\n');
    assert.equal(stop(s.work), undefined, 'map-drift is not an interactive hook control');
    assert.equal(readFileSync(path.join(s.work, 'CODEBASE-MAP.md'), 'utf8'), before);
  } finally { s.cleanup(); }
});

// The Stop hook regenerating the map means the map changes in a working copy no plan claims.
// It is harness output, like `.claude/harness/state/`, and scope-drift must not report it.
test('a regenerated CODEBASE-MAP.md is not scope drift', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    writeFileSync(path.join(s.work, 'CODEBASE-MAP.md'), '# Codebase map\n');
    const r = await scopeDrift({ layout: { root: s.work, artifacts: path.join(s.work, '.claude/harness/artifacts') } });
    assert.equal(r.verdict, 'pass', JSON.stringify(r.findings));
  } finally { s.cleanup(); }
});

test('Stop does not create an optional map in a repository that has none', () => {
  const s = stage(FIXTURES, 'graph-app');
  try {
    assert.equal(spawnSync(process.execPath, [BIN, 'graph', 'build'], { cwd: s.work, encoding: 'utf8' }).status, 0);
    assert.ok(!existsSync(path.join(s.work, 'CODEBASE-MAP.md')));
    assert.equal(stop(s.work), undefined);
    assert.ok(!existsSync(path.join(s.work, 'CODEBASE-MAP.md')));
  } finally { s.cleanup(); }
});
