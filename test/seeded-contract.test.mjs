// M1.C F15. Six of the seven non-green tasks in the 2026-09-16 run failed the same way: after
// `f6feb3a` the fixtures genuinely install the harness steering, so the agent writes
// intent/spec/plan and stops for approval — exactly as told — and never reaches the behaviour the
// task grades. The suite was measuring the approval gate six times over.
//
// The repair keeps golden tasks single-turn. A task may declare the contract its work presupposes,
// and `stage()` writes it, commits it and approves it through the harness's own `approve()` before
// the model is ever called. The task then measures implementation against a given contract, which
// is what its assertions were always about.
//
// It is `approve()` and not a hand-written `status: approved`, because the preconditions are the
// point: committed first, no scaffold placeholders left, a Proof row for every behaviour, spec
// before plan. A seeded contract that could not survive the real gate would be a fixture asserting
// something the harness would refuse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { stage, FIXTURES } from '../evals/lib/stage.mjs';
import { loadConfig } from '../.aidlc/lib/config.mjs';
import { read } from '../.aidlc/lib/artifacts.mjs';

const CONTRACT = {
  slug: 'extract-validation',
  outcome: 'The validation block in handlers.py is its own named function.',
  behaviour: 'Given a payload, when it is rendered, then validation runs from one named function and the observable behaviour is unchanged.',
  files: ['src/app/handlers.py'],
  proof: '`tests/test_handlers.py`',
};

test('A1 a seeded contract is approved through the real gate, not written as approved', () => {
  const s = stage(FIXTURES, 'clean-app', { approved: CONTRACT });
  try {
    const cfg = loadConfig(s.work);
    for (const kind of ['spec', 'plan']) {
      const artifact = read(cfg, CONTRACT.slug, kind);
      assert.ok(artifact, `${kind} missing from the staged tree`);
      assert.equal(artifact.state, 'approved', `${kind} is ${artifact?.state}, so the agent still faces a gate`);
      assert.equal(artifact.front.status, 'approved');
      // Not stale: a digest that no longer matches its body is an approval of something else.
      assert.notEqual(artifact.state, 'stale-approval');
    }
    // The plan is bound to the spec it was approved against.
    const plan = read(cfg, CONTRACT.slug, 'plan');
    assert.ok(plan.front.spec_digest, 'the plan records no spec digest, so it is approved against nothing');
    // The scope the agent is allowed to touch is the one the task declared.
    assert.match(readFileSync(path.join(s.work, `.aidlc/artifacts/${CONTRACT.slug}/plan.md`), 'utf8'),
      /src\/app\/handlers\.py/);
  } finally { s.cleanup(); }
});

test('A2 the contract is committed, because an uncommitted approval is unreadable history', () => {
  const s = stage(FIXTURES, 'clean-app', { approved: CONTRACT });
  try {
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: s.work, encoding: 'utf8' });
    assert.equal(dirty.trim(), '', `staged tree is dirty before the model runs:\n${dirty}`);
  } finally { s.cleanup(); }
});

test('A3 a fixture with no contract declared is untouched, so refusal tasks still measure refusals', () => {
  // clean-app also serves `clarify-ambiguous` (must ask, not build) and `prefix-cache-guard`
  // (must be refused). Seeding those would delete the very thing they grade.
  const s = stage(FIXTURES, 'clean-app');
  try {
    const artifacts = path.join(s.work, '.aidlc/artifacts');
    const seeded = existsSync(path.join(artifacts, CONTRACT.slug));
    assert.equal(seeded, false, 'a fixture staged without `approved` must carry no contract');
  } finally { s.cleanup(); }
});
