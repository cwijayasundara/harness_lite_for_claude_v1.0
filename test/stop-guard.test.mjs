// an-unattended-turn-does-not-end-on-a-question B3–B6. F34: under the unattended runner the
// intent skill's "Stop. Ask the person" beat the notice's "there is no person", and a sprint
// ended on a question. Instruction does not steer against instruction; a Stop hook does. Once
// per turn — `stop_hook_active` is the CLI's own signal that a turn is already continuing from
// a block — and only when the runner's variable is in the hook's environment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { A, BIN, ROOT } from './_paths.mjs';
import { stage } from '../evals/lib/stage.mjs';

const FIXTURES = path.join(ROOT, 'evals', 'fixtures');

function declared(work) {
  assert.equal(spawnSync(process.execPath, [BIN, 'new', 'product-docs'], { cwd: work, encoding: 'utf8' }).status, 0);
  writeFileSync(path.join(work, '.aidlc/artifacts/product-docs/intent.md'), '---\nstatus: draft\n---\n# Intent: product-docs\n\n## Problem\n\nNo statement of what the ledger does.\n');
}

function stop(work, { unattended, active = false }) {
  const env = { ...process.env };
  if (unattended) env.AIDLC_UNATTENDED = '1'; else delete env.AIDLC_UNATTENDED;
  const r = spawnSync(process.execPath, [BIN, 'hook', 'stop'], { cwd: work, encoding: 'utf8', env, input: JSON.stringify({ cwd: work, hook_event_name: 'Stop', stop_hook_active: active }) });
  assert.equal(r.status, 0, r.stderr);
  const ledger = path.join(work, '.aidlc/state/ledger.jsonl');
  const rows = existsSync(ledger) ? readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((row) => row.control === 'stop-guard') : [];
  let block = null;
  try { block = JSON.parse(r.stdout); } catch { /* plain notes or nothing */ }
  return { stdout: r.stdout, block, rows };
}

test('unattended, the first Stop with declared work waiting is refused once, then let through', () => {
  const s = stage(FIXTURES, 'campaign-ledger');
  try {
    declared(s.work);
    const first = stop(s.work, { unattended: true });
    assert.equal(first.block?.decision, 'block', first.stdout);
    assert.match(first.block.reason, /product-docs/);
    assert.match(first.block.reason, /nobody/i);
    assert.equal(first.rows.at(-1)?.verdict, 'fail');

    const second = stop(s.work, { unattended: true, active: true });
    assert.equal(second.block?.decision, undefined, 'a turn already continuing from a block ends');
    assert.equal(second.rows.at(-1)?.verdict, 'pass');
    assert.equal(second.rows.at(-1)?.rule, 'let-through');
  } finally { s.cleanup(); }
});

test('attended, the same state blocks nothing and records nothing', () => {
  const s = stage(FIXTURES, 'campaign-ledger');
  try {
    declared(s.work);
    const r = stop(s.work, { unattended: false });
    assert.equal(r.block?.decision, undefined, r.stdout);
    assert.deepEqual(r.rows, []);
  } finally { s.cleanup(); }
});

test('unattended with nothing waiting blocks nothing', () => {
  const s = stage(FIXTURES, 'campaign-ledger');
  try {
    const r = stop(s.work, { unattended: true });
    assert.equal(r.block?.decision, undefined, r.stdout);
  } finally { s.cleanup(); }
});

// B6: the skill and the hook say the same thing.
test('the intent skill names the unattended case at its last step', () => {
  assert.match(readFileSync(path.join(A, 'skills', 'intent', 'SKILL.md'), 'utf8'), /unattended/i);
});
