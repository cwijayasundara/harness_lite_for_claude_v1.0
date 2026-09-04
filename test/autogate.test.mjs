// campaigns-run-unattended. `AIDLC_UNATTENDED` lets a campaign step pass its own gates with no
// human present, and the artifact it leaves behind must never read as though one was.
//
// evolving-scope F1: the workflow's gates require a human, and an unattended run has none.
// evidence.md F2: an agent refused by the write guard rewrote `harness.toml` to open a switch of
// its own. The signal this change adds must not be another switch that same agent could write —
// so several tests here prove the working copy has no say over it at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { BIN } from './_paths.mjs';
import { runSuite } from '../evals/run.mjs';
import { FIXTURES } from '../evals/lib/stage.mjs';

const run = (root, env, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8', env });

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'harness-autogate-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['config', 'user.email', 'harness@example.invalid'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 'Harness Test'], { cwd: root });
  assert.equal(run(root, process.env, 'init', '--into', root).status, 0);
  return root;
}

const commit = (root, m) => {
  spawnSync('git', ['add', '-A'], { cwd: root });
  spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', m], { cwd: root });
};

// evidence.md F6: the first attempt put the notice in `harness status`, reasoning that CLAUDE.md
// tells the agent to run it. The agent never ran it. `SessionStart` is the channel that pushes
// context whether or not the agent goes looking — proven by the `contract:` line already there.
function sessionStart(root, env) {
  const r = spawnSync(process.execPath, [BIN, 'hook', 'session-start'], { cwd: root, encoding: 'utf8', env, input: JSON.stringify({ cwd: root }) });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
}

// B1. A campaign step writes intent, spec and plan, commits them, and approves them with no
// human present. Both gates, not just the spec — auto-approving only gate 1 would just move the
// halt to gate 2. And the agent has to be told this before it starts, not on request: F6 is what
// happens when the notice sits somewhere the agent has no reason to look.
test('B1: with AIDLC_UNATTENDED set, both gates approve with no --by and no human', () => {
  const root = repo();
  try {
    // A real repository's session start is byte-identical to what it is today.
    assert.doesNotMatch(sessionStart(root, process.env), /unattended|AIDLC_UNATTENDED/);

    const unattendedContext = sessionStart(root, { ...process.env, AIDLC_UNATTENDED: '1' });
    assert.match(unattendedContext, /no human/i);
    assert.match(unattendedContext, /harness approve/);
    assert.match(unattendedContext, /harness new <slug>/);
    assert.match(unattendedContext, /\.aidlc\/artifacts\/<slug>\//);

    assert.equal(run(root, process.env, 'new', 'unattended-demo').status, 0);
    commit(root, 'draft unattended-demo');
    const unattended = { ...process.env, AIDLC_UNATTENDED: '1' };

    const spec = run(root, unattended, 'approve', 'unattended-demo', 'spec');
    assert.equal(spec.status, 0, spec.stderr);
    commit(root, 'spec approved');

    const plan = run(root, unattended, 'approve', 'unattended-demo', 'plan');
    assert.equal(plan.status, 0, plan.stderr);

    assert.match(readFileSync(path.join(root, '.aidlc/artifacts/unattended-demo/spec.md'), 'utf8'), /^by: unattended-eval-run$/m);
    assert.match(readFileSync(path.join(root, '.aidlc/artifacts/unattended-demo/plan.md'), 'utf8'), /^by: unattended-eval-run$/m);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// B2. The identity is forced, not defaulted. An agent that can choose its own approver name can
// write a person's, and a campaign result must never be readable as evidence that someone looked.
test('B2: --by cwijayasundara is overridden — the recorded identity cannot be mistaken for a person', () => {
  const root = repo();
  try {
    assert.equal(run(root, process.env, 'new', 'forced-identity').status, 0);
    commit(root, 'draft forced-identity');
    const unattended = { ...process.env, AIDLC_UNATTENDED: '1' };

    const result = run(root, unattended, 'approve', 'forced-identity', 'spec', '--by', 'cwijayasundara');
    assert.equal(result.status, 0, result.stderr);

    const front = readFileSync(path.join(root, '.aidlc/artifacts/forced-identity/spec.md'), 'utf8');
    assert.match(front, /^by: unattended-eval-run$/m);
    assert.doesNotMatch(front, /cwijayasundara/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// B3. The signal comes from the runner that staged the copy, never from inside it. `evidence.md`
// F2 recorded an agent that rewrote `harness.toml` to disable `require_contract`; a switch that
// same agent could have written inside the copy would be the same defect wearing a different hat.
test('B3: off by default, and a harness.toml asking for auto-approval changes nothing', () => {
  const root = repo();
  try {
    assert.equal(run(root, process.env, 'new', 'no-backdoor').status, 0);
    // Plant the switch an agent inside the copy could write for itself.
    const toml = path.join(root, '.aidlc/harness.toml');
    writeFileSync(toml, `${readFileSync(toml, 'utf8')}\n[unattended]\nenabled = true\napprover = "cwijayasundara"\n`);
    commit(root, 'draft no-backdoor, plus a harness.toml asking to be auto-approved');

    // No AIDLC_UNATTENDED in the environment: the human gate applies exactly as it does today.
    const noApprover = run(root, process.env, 'approve', 'no-backdoor', 'spec');
    assert.equal(noApprover.status, 1);
    assert.match(noApprover.stderr, /an approval needs an approver/);

    // Supplying --by still works, and records exactly what was supplied — the file in the working
    // copy had no say over the identity, because it was never consulted.
    const withApprover = run(root, process.env, 'approve', 'no-backdoor', 'spec', '--by', 'tester');
    assert.equal(withApprover.status, 0, withApprover.stderr);
    const front = readFileSync(path.join(root, '.aidlc/artifacts/no-backdoor/spec.md'), 'utf8');
    assert.match(front, /^by: tester$/m);
    assert.doesNotMatch(front, /unattended-eval-run/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// B5. Every other precondition still holds. A gate that stops checking what it checks today has
// not run unattended; it has stopped.
test('B5: uncommitted, plan-before-spec, digest and stale-approval all still hold when unattended', () => {
  const root = repo();
  try {
    assert.equal(run(root, process.env, 'new', 'still-gated').status, 0);
    const unattended = { ...process.env, AIDLC_UNATTENDED: '1' };

    // Uncommitted is still refused.
    const early = run(root, unattended, 'approve', 'still-gated', 'spec');
    assert.equal(early.status, 1);
    assert.match(early.stderr, /commit .*spec\.md before approving/);
    commit(root, 'draft still-gated');

    // A plan before its spec is still refused.
    const outOfOrder = run(root, unattended, 'approve', 'still-gated', 'plan');
    assert.equal(outOfOrder.status, 1);
    assert.match(outOfOrder.stderr, /approve the spec before the plan/);

    const spec = run(root, unattended, 'approve', 'still-gated', 'spec');
    assert.equal(spec.status, 0, spec.stderr);
    const digest = /^digest: (sha256:[a-f0-9]{64})$/m.exec(readFileSync(path.join(root, '.aidlc/artifacts/still-gated/spec.md'), 'utf8'));
    assert.ok(digest, 'the body digest is still written');
    commit(root, 'spec approved');

    // stale-approval still fires.
    const specFile = path.join(root, '.aidlc/artifacts/still-gated/spec.md');
    writeFileSync(specFile, readFileSync(specFile, 'utf8') + '\nAdded after approval.\n');
    const status = run(root, unattended, 'status', 'still-gated');
    assert.equal(status.status, 1, status.stdout);
    assert.match(status.stdout, /stale-approval/);

    const blockedPlan = run(root, unattended, 'approve', 'still-gated', 'plan');
    assert.equal(blockedPlan.status, 1);
    assert.match(blockedPlan.stderr, /re-approve it first/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// B7. A mechanism that silently substitutes for a human should be the loudest thing in the log,
// not a detail in a tmpdir about to be deleted. `runSuite` is exercised here with a fake invoker
// that approves an artifact unattended, exactly as `evals/lib/invoker.mjs` will in a real run once
// it sets the same variable — no model, no spend.
test('B7: the results JSON of a fake-invoker run lists the auto-approved artifacts', async () => {
  const invoke = ({ cwd }) => {
    const env = { ...process.env, AIDLC_UNATTENDED: '1' };
    spawnSync(process.execPath, [BIN, 'new', 'auto-demo'], { cwd, encoding: 'utf8' });
    commit(cwd, 'draft auto-demo');
    const approved = spawnSync(process.execPath, [BIN, 'approve', 'auto-demo', 'spec'], { cwd, encoding: 'utf8', env });
    assert.equal(approved.status, 0, approved.stderr);
    return { transcript: 'done', usage: { usd: 0.01 } };
  };
  const out = await runSuite({
    tasks: [{ id: 'auto-approve-demo', fixture: 'clean-app', prompt: 'x', repeats: 1, timeoutMs: 1000, budgetUsd: 1,
      assert: [{ workdir_unchanged: false }] }],
    invoke, fixturesDir: FIXTURES, harnessBin: BIN,
  });
  assert.deepEqual(out.results[0].unattended, ['auto-demo/spec.md']);
  assert.deepEqual(out.results[0].runs[0].unattended, ['auto-demo/spec.md']);
});
