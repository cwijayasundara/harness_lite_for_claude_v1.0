// G11. Two economies, both per-turn, both previously paid on every turn for an answer that had
// not changed.
//
// The first is the prompt prefix: a cached prefix survives only while it is byte-identical, and
// the SessionStart payload interleaved stable lines with a ledger row count that moved on every
// single check. Everything after the first moving line was re-sent every session.
//
// The second is the Stop hook, which ran the whole suite at the end of every turn. The full suite
// belongs to `harness deliver`, once per iteration; the hook runs `fast` plus the tests that name
// what the turn actually touched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadConfig, DEFAULT_STAGES, resolveStage } from '../.aidlc/lib/config.mjs';
import { sessionContext, STABLE_END } from '../.aidlc/lib/session.mjs';
import { changedTests, runOne } from '../.aidlc/lib/runner.mjs';
import { clearSelection } from '../.aidlc/lib/artifacts.mjs';
import { append } from '../.aidlc/lib/ledger.mjs';
import { FIXTURES, stage } from '../evals/lib/stage.mjs';
import { BIN, ROOT } from './_paths.mjs';

const stableHalf = (payload) => {
  const lines = payload.split('\n');
  const end = lines.findIndex((line) => line.startsWith(STABLE_END));
  assert.ok(end >= 0, `the payload has no "${STABLE_END}" line to end the stable half at`);
  return lines.slice(0, end + 1).join('\n');
};

test('two consecutive session payloads differ only after the last stable line', () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const cfg = loadConfig(s.work);
    const first = sessionContext(cfg);

    // Something below the boundary moves: the worktree's selected change, and a ledger that has
    // gained rows — which under the old order would have moved the fourth line of the payload.
    append({ stage: 'fast', control: 'secrets', verdict: 'pass', ms: 1, findings: 0 }, cfg.layout);
    clearSelection(cfg);
    const second = sessionContext(cfg);

    assert.notEqual(first, second, 'nothing moved, so this test proves nothing');
    assert.equal(stableHalf(first), stableHalf(second), 'a line above the boundary moved between sessions');
    assert.ok(stableHalf(second).split('\n').length >= 4, 'the stable half is the part worth caching');

    // The row count is gone, not merely moved: it changed on every check and nothing acted on it.
    for (const payload of [first, second]) {
      assert.doesNotMatch(payload, /rows over \d+ runs/, 'the ledger row count is back in the payload');
    }
    // And the volatile lines are still there — this is a reordering, not a deletion.
    assert.match(second, /^current:/m);
  } finally { s.cleanup(); }
});

test('the Stop hook runs stop_hook — fast plus the tests naming what changed — not the whole suite', () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const out = spawnSync(process.execPath, [BIN, 'hook', 'stop'], { cwd: s.work, encoding: 'utf8',
      input: JSON.stringify({ cwd: s.work, hook_event_name: 'Stop' }) });
    assert.equal(out.status, 0, out.stderr);
    const ledger = path.join(s.work, '.aidlc/state/ledger.jsonl');
    const rows = readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const invocations = rows.filter((r) => r.kind === 'check-invocation');
    assert.ok(invocations.length, 'the Stop hook recorded no check at all');
    for (const row of invocations) assert.equal(row.stage, 'stop_hook', 'the Stop hook is still running the full stop stage');
    assert.ok(rows.some((r) => r.control === 'test_changed'), 'the narrowed test verb did not run');
    assert.ok(!rows.some((r) => r.stage === 'stop_hook' && r.control === 'test'), 'the whole suite ran at the end of a turn');
  } finally { s.cleanup(); }
});

test('stop_hook is a stage in the defaults and in both registries, and stop still means the whole suite', () => {
  assert.deepEqual(DEFAULT_STAGES.stop_hook, ['fast', 'test_changed']);
  const cfg = loadConfig(ROOT);
  assert.deepEqual(cfg.stages.stop_hook, ['fast', 'test_changed']);
  assert.ok(resolveStage(cfg, 'stop').includes('test'), 'stop is still the full suite for the driver and for a human');
  assert.ok(resolveStage(cfg, 'stop_hook').includes('test_changed'));
  assert.ok(!resolveStage(cfg, 'stop_hook').includes('test'), 'the hook stage must not expand to the full suite');
  // The template a project installs carries the same shape, or a consumer gets the old cost.
  const template = readFileSync(path.join(ROOT, '.aidlc/templates/harness.toml'), 'utf8');
  assert.match(template, /^stop_hook = \["fast", "test_changed"\]$/m);
  assert.match(template, /^test_changed = ""/m);
});

test('the narrowed test verb selects what the turn touched, and nothing when nothing names it', () => {
  const cfg = loadConfig(ROOT);
  const all = readdirSync(path.join(ROOT, 'test')).filter((f) => f.endsWith('.test.mjs'));

  // A changed library selects the test whose name carries its stem, and — when the graph has been
  // built — every other test that imports it. `test/mechanisms.test.mjs` imports `review.mjs`
  // without naming it, which is exactly the case a stem match alone would miss.
  const picked = changedTests(cfg, ['.aidlc/lib/review.mjs']);
  assert.ok(picked.includes('test/review.test.mjs'), picked.join(', '));
  assert.ok(picked.every((f) => f.startsWith('test/')));
  assert.ok(picked.length < all.length / 4, `narrowing selected ${picked.length} of ${all.length} test files`);

  // A changed test is its own answer.
  assert.ok(changedTests(cfg, ['test/deliver.test.mjs']).includes('test/deliver.test.mjs'));
  for (const f of ['test/deliver.test.mjs', 'test/review.test.mjs']) {
    assert.ok(changedTests(cfg, ['.aidlc/lib/deliver.mjs', 'test/review.test.mjs']).includes(f));
  }
  // Nothing that any test names is not a pass and not a failure; the verb reports `skipped`.
  assert.deepEqual(changedTests(cfg, ['README.md']), []);
  assert.deepEqual(changedTests(cfg, []), []);
});

test('a project with no narrowed test command gets a skipped verb, never a silent full suite', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const cfg = loadConfig(s.work);
    // Law 6: an unconfigured capability is `skipped`. The risk this pins down is the other
    // reading — quietly falling back to the project's full `test` command, which would put the
    // whole suite back at the end of every turn under a verb that claims to be narrow.
    const unset = await runOne({ ...cfg, capabilities: { ...cfg.capabilities, test_changed: '' } }, 'test_changed', ['src/app/text.py'], []);
    assert.equal(unset.verdict, 'skipped');
    assert.match(unset.note, /no "test_changed" command/);
    assert.equal(unset.command, '');

    const configured = { ...cfg, capabilities: { ...cfg.capabilities, test_changed: 'echo narrowed to {files}' } };
    assert.match((await runOne(configured, 'test_changed', ['tests/test_app.py'], [])).command, /tests\/test_app\.py/);
    // Nothing the turn touched is named by any test: still not a pass, and still not the suite.
    const unrelated = await runOne(configured, 'test_changed', ['README.md'], []);
    assert.equal(unrelated.verdict, 'skipped');
    assert.match(unrelated.note, /no test names/);
  } finally { s.cleanup(); }
});
