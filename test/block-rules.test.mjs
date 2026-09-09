// a-block-names-its-rule: every block the harness records names the rule that produced it, so
// `harness ledger flag <rule>` can reach it and the audit's per-rule split can see it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ROOT } from './_paths.mjs';
import { ruleOf } from '../.aidlc/lib/runner.mjs';
import { writeBlocked, writeRefusal } from '../.aidlc/lib/guard.mjs';
import { flag, read as readLedger, append } from '../.aidlc/lib/ledger.mjs';

const read = rel => readFileSync(path.join(ROOT, rel), 'utf8');
const RUNNER = read('.aidlc/lib/runner.mjs');
const DISPATCH = read('.aidlc/hooks/dispatch.mjs');

const workspace = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'block-rules-'));
  const state = path.join(root, '.aidlc/state');
  mkdirSync(state, { recursive: true });
  return { root, L: { root, state, ledger: path.join(state, 'ledger.jsonl'), runId: path.join(state, 'run-id') },
    cleanup: () => rmSync(root, { recursive: true, force: true }) };
};

test('B1 a control records the rule its first tagged finding names, and none when untagged', () => {
  assert.equal(ruleOf([{ rule: 'unkept-proof' }, { rule: 'scope-drift' }]), 'unkept-proof',
    'the row records the rule the operator reads first');
  assert.equal(ruleOf([{ message: 'no tag' }, { rule: 'deleted-test' }]), 'deleted-test',
    'an untagged finding does not hide a tagged one behind it');
  assert.equal(ruleOf([{ message: 'no tag' }]), null, 'a control reporting no rule records none');
  assert.equal(ruleOf([]), null);
  assert.equal(ruleOf(undefined), null, 'absent findings must not throw inside the ledger append');

  // The row the runner builds takes it from the same findings it prints, and only on a block.
  assert.match(RUNNER, /const rule = ruleOf\(r\.findings\)/);
  assert.match(RUNNER, /\.\.\.\(r\.verdict === 'fail' && rule \? \{ rule \} : \{\}\)/,
    'a passing row must carry no rule');
});

test('B2 the write guard names which refusal fired, and the agent sees the same text', () => {
  const s = workspace();
  try {
    const cfg = { layout: { root: s.root, state: s.L.state },
      guard: { require_contract: true, protected_paths: ['evals/fixtures/'] } };

    const prefix = writeRefusal('.claude/CLAUDE.md', cfg);
    assert.equal(prefix.rule, 'prefix-cache');
    assert.match(prefix.message, /configures agent instructions or permissions/);

    const protectedPath = writeRefusal('evals/fixtures/clean-app/x.mjs', cfg);
    assert.equal(protectedPath.rule, 'protected-path');
    assert.match(protectedPath.message, /protected_paths/);

    mkdirSync(s.L.state, { recursive: true });
    writeFileSync(path.join(s.L.state, 'test-lock.json'),
      JSON.stringify({ patterns: ['test/locked'], why: 'a bug fix is in progress' }));
    const locked = writeRefusal('test/locked.test.mjs', cfg);
    assert.equal(locked.rule, 'test-lock');
    assert.match(locked.message, /test-locked because/);
    rmSync(path.join(s.L.state, 'test-lock.json'));

    const scope = writeRefusal('src/anything.mjs', cfg);
    assert.equal(scope.rule, 'write-scope');
    assert.ok(scope.message.length > 0, 'the refusal still carries text for the agent');

    assert.equal(writeRefusal('.aidlc/artifacts/x/intent.md', cfg), null,
      'an artifact stays writable: a gate you cannot draft is not a gate');

    // Every existing caller keeps the refusal string it has always read.
    assert.equal(writeBlocked('src/anything.mjs', cfg), scope.message);
    assert.equal(writeBlocked('.aidlc/artifacts/x/intent.md', cfg), null);

    // The hook records the name and denies with the message, not the object.
    assert.match(DISPATCH, /control: 'write-guard', rule: hit\.rule, verdict: 'fail'/);
    assert.match(DISPATCH, /return deny\(hit\.message\)/);
  } finally { s.cleanup(); }
});

test('B3 flag reaches the new names and leaves what the guard wrote intact', () => {
  const s = workspace();
  try {
    append({ stage: 'pre-write', control: 'write-guard', rule: 'write-scope', verdict: 'fail', ms: 0, findings: 1 }, s.L);
    append({ stage: 'commit', control: 'scope-drift', rule: 'unkept-proof', verdict: 'fail', ms: 3, findings: 1 }, s.L);
    const before = readLedger(s.L);

    assert.equal(flag(s.L, { rule: 'write-scope' }), 1, 'a write-guard block can now be called wrong');
    assert.equal(flag(s.L, { rule: 'unkept-proof' }), 1, 'so can a scope-drift block');

    const after = readLedger(s.L);
    assert.equal(after.length, before.length, 'flagging adds no rows');
    for (const [i, row] of after.entries()) {
      assert.equal(row.false, true);
      for (const key of ['stage', 'control', 'rule', 'verdict', 'ms', 'findings', 'ts', 'run']) {
        assert.deepEqual(row[key], before[i][key], `flag rewrote ${key}`);
      }
    }
  } finally { s.cleanup(); }
});

test('B4 nothing else about the row, the guards or the ledger surface moved', () => {
  const s = workspace();
  try {
    append({ stage: 'stop', control: 'test', verdict: 'pass', ms: 5, findings: 0 }, s.L);
    const [row] = readLedger(s.L);
    assert.equal('rule' in row, false, 'a passing row names no rule');
    assert.deepEqual(Object.keys(row).sort(),
      ['control', 'findings', 'ms', 'run', 'stage', 'ts', 'verdict'],
      'the row schema gained a key');

    // The guards still refuse exactly what they refused; only the naming changed.
    const GUARD = read('.aidlc/lib/guard.mjs');
    for (const branch of [/PREFIX_CACHE_PATHS/, /protected_paths/, /test-lock\.json/, /requireContract/]) {
      assert.match(GUARD, branch, 'a refusal branch disappeared');
    }
    assert.ok(existsSync(path.join(ROOT, 'test/ledger-evidence.test.mjs')),
      'the freeze this change must not need relaxed still exists');
  } finally { s.cleanup(); }
});
