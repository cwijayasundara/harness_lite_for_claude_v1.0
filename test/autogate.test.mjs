// campaigns-run-unattended. `AIDLC_UNATTENDED` lets a campaign step pass its own gates with no
// human present, and the artifact it leaves behind must never read as though one was.
//
// evolving-scope F1: the workflow's gates require a human, and an unattended run has none.
// evidence.md F2: an agent refused by the write guard rewrote `harness.toml` to open a switch of
// its own. The signal this change adds must not be another switch that same agent could write —
// so several tests here prove the working copy has no say over it at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { BIN } from './_paths.mjs';
import { runSuite } from '../evals/run.mjs';
import { FIXTURES } from '../evals/lib/stage.mjs';
import { claudeInvoker } from '../evals/lib/invoker.mjs';

const run = (root, env, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8', env });

// review `419c0a4`: the attended stand-in. An operator with AIDLC_UNATTENDED exported would
// otherwise falsify these tests' premise before their first assertion — the same strip the
// invoker does in `evals/lib/invoker.mjs`.
const attended = () => { const e = { ...process.env }; delete e.AIDLC_UNATTENDED; return e; };

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

// a-plan-proves-its-spec B1: `approve` now refuses a `spec.md` or `plan.md` still carrying the
// `harness new` scaffold. Every fixture below approves itself unattended to exercise that
// *mechanism* — it must go on doing exactly that, so each placeholder is swapped for the shortest
// fixture-shaped text that clears it. Nothing here reads as a real spec or plan on purpose.
function deScaffold(text) {
  return text
    .replace('<The observable result, in the language of the affected user.>', 'Fixture content — this file exists to test the unattended mechanism, not this text.')
    .replace('Given ...\nWhen ...\nThen ...', 'Given this fixture exists\nWhen it is approved\nThen the approval succeeds')
    .replace('<Consequential architecture, interfaces, state and failure paths. Omit if not needed.>', 'No consequential design decisions in this approval-state fixture.')
    .replace('<Explicit boundaries. What a reader might reasonably expect and will not get.>', 'Nothing — this is a fixture.')
    .replace('<Security, privacy, compatibility, performance and operational invariants this must not break.>', 'None — this is a fixture.')
    .replace('<The approach and why it fits. Discuss alternatives only when a meaningful tradeoff exists.>', 'Fixture content — no real approach; this file exists to test the unattended mechanism.')
    .replace(/<Every path this change may touch, in backticks, one per line\. `scope-drift` and the write guard\nread this section and nothing else: a path not named here cannot be written\.>/, 'Fixture content — no real files section needed here.')
    .replace('<Ordered step naming an exact path.>', 'Fixture content — no real steps needed here.')
    .replace('<named test or runtime evidence>', 'manual check: fixture only');
}

function deScaffoldArtifacts(root, slug, kinds) {
  for (const kind of kinds) {
    const target = path.join(root, '.aidlc/artifacts', slug, `${kind}.md`);
    writeFileSync(target, deScaffold(readFileSync(target, 'utf8')));
  }
}

// evidence.md F6: the first attempt put the notice in `harness status`, reasoning that CLAUDE.md
// tells the agent to run it. The agent never ran it. `SessionStart` is the channel that pushes
// context whether or not the agent goes looking — proven by the `contract:` line already there.
function sessionStart(root, env) {
  const r = spawnSync(process.execPath, [BIN, 'hook', 'session-start'], { cwd: root, encoding: 'utf8', env, input: JSON.stringify({ cwd: root }) });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
}

test('legacy environment flags cannot approve a gate or grant self-approval', () => {
  const root = repo();
  try {
    run(root, process.env, 'new', 'still-human');
    deScaffoldArtifacts(root, 'still-human', ['spec', 'plan']);
    commit(root, 'draft');
    for (const flag of ['AIDLC_UNATTENDED', 'AIDLC_EVAL']) {
      const env = { ...attended(), [flag]: '1' };
      assert.doesNotMatch(sessionStart(root, env), /approve your own|no human|no questions/);
      for (const kind of ['spec', 'plan']) {
        const result = run(root, env, 'approve', 'still-human', kind);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /needs an approver/);
      }
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// B3. The signal comes from the runner that staged the copy, never from inside it. `evidence.md`
// F2 recorded an agent that rewrote `harness.toml` to disable `require_contract`; a switch that
// same agent could have written inside the copy would be the same defect wearing a different hat.
test('B3: off by default, and a harness.toml asking for auto-approval changes nothing', () => {
  const root = repo();
  try {
    assert.equal(run(root, process.env, 'new', 'no-backdoor').status, 0);
    deScaffoldArtifacts(root, 'no-backdoor', ['spec']);
    // Plant the switch an agent inside the copy could write for itself.
    const toml = path.join(root, '.aidlc/harness.toml');
    writeFileSync(toml, `${readFileSync(toml, 'utf8')}\n[unattended]\nenabled = true\napprover = "cwijayasundara"\n`);
    commit(root, 'draft no-backdoor, plus a harness.toml asking to be auto-approved');

    // No AIDLC_UNATTENDED in the environment: the human gate applies exactly as it does today.
    const noApprover = run(root, attended(), 'approve', 'no-backdoor', 'spec');
    assert.equal(noApprover.status, 1);
    assert.match(noApprover.stderr, /an approval needs an approver/);

    // Supplying --by still works, and records exactly what was supplied — the file in the working
    // copy had no say over the identity, because it was never consulted.
    const withApprover = run(root, attended(), 'approve', 'no-backdoor', 'spec', '--by', 'tester');
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
    deScaffoldArtifacts(root, 'still-gated', ['spec']);
    const unattended = { ...process.env, AIDLC_UNATTENDED: '1' };

    // Uncommitted is still refused.
    const early = run(root, unattended, 'approve', 'still-gated', 'spec', '--by', 'simulated-test-driver');
    assert.equal(early.status, 1);
    assert.match(early.stderr, /commit .*spec\.md before approving/);
    commit(root, 'draft still-gated');

    // A plan before its spec is still refused.
    const outOfOrder = run(root, unattended, 'approve', 'still-gated', 'plan', '--by', 'simulated-test-driver');
    assert.equal(outOfOrder.status, 1);
    assert.match(outOfOrder.stderr, /approve the spec before the plan/);

    const spec = run(root, unattended, 'approve', 'still-gated', 'spec', '--by', 'simulated-test-driver');
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

    const blockedPlan = run(root, unattended, 'approve', 'still-gated', 'plan', '--by', 'simulated-test-driver');
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
    deScaffoldArtifacts(cwd, 'auto-demo', ['spec']);
    commit(cwd, 'draft auto-demo');
    const approved = spawnSync(process.execPath, [BIN, 'approve', 'auto-demo', 'spec', '--by', 'unattended-eval-run'], { cwd, encoding: 'utf8', env });
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

// review `1ace6a8` (Blocking 1). Setting `AIDLC_UNATTENDED` unconditionally in `claudeInvoker`
// reached all 24 eval tasks, not the 2 campaigns — 8 of the 22 golden tasks are artifact- or
// contract-shaped, and one of them grades whether the agent refuses and says so. Scoped to a
// campaign step by `task.steps`, which only a campaign task carries. A fake `claude` on PATH
// dumps its own env so the real code path — not a fake invoker standing in for it — actually
// runs; no model, no spend.
test('invoker strips former bypass flags from campaigns and single-prompt tasks', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'stub-claude-'));
  const envLog = path.join(dir, 'env.txt');
  writeFileSync(path.join(dir, 'claude'), `#!/usr/bin/env bash\nenv > ${JSON.stringify(envLog)}\necho '{"result":"done","total_cost_usd":0}'\n`);
  chmodSync(path.join(dir, 'claude'), 0o755);
  const previousPath = process.env.PATH;
  process.env.PATH = `${dir}:${previousPath}`;
  try {
    const invoke = claudeInvoker({});

    // A single-prompt golden task: `task` carries no `steps`.
    invoke({ prompt: 'x', cwd: dir, timeoutMs: 5000, budgetUsd: 1, task: { id: 'golden-task', prompt: 'x' } });
    assert.doesNotMatch(readFileSync(envLog, 'utf8'), /^AIDLC_UNATTENDED=/m, 'a single-prompt task must run exactly as it does for a real, attended repository');

    // A campaign step: `task.steps` is present, as `evals/run.mjs` builds it.
    invoke({ prompt: 'x', cwd: dir, timeoutMs: 5000, budgetUsd: 1, task: { id: 'campaign', steps: [{ prompt: 'x' }] }, step: 0 });
    assert.doesNotMatch(readFileSync(envLog, 'utf8'), /^AIDLC_(UNATTENDED|EVAL)=/m);

    // review `419c0a4` (Blocking 2): the runner must not merely not-add the variable — it must
    // strip one it inherited. An operator with AIDLC_UNATTENDED already exported puts every
    // single-prompt golden task right back where Blocking 1 had it.
    const previousUnattended = process.env.AIDLC_UNATTENDED;
    process.env.AIDLC_UNATTENDED = '1';
    try {
      invoke({ prompt: 'x', cwd: dir, timeoutMs: 5000, budgetUsd: 1, task: { id: 'golden-task', prompt: 'x' } });
      assert.doesNotMatch(readFileSync(envLog, 'utf8'), /^AIDLC_UNATTENDED=/m, 'inherited from the parent shell, a single-prompt task must still run attended');
    } finally {
      if (previousUnattended === undefined) delete process.env.AIDLC_UNATTENDED;
      else process.env.AIDLC_UNATTENDED = previousUnattended;
    }
  } finally { process.env.PATH = previousPath; rmSync(dir, { recursive: true, force: true }); }
});

// review `1ace6a8` (Important 2). A campaign that self-approves in an earlier sprint and then
// throws in a later one must still report what it approved — the working copy is about to be
// deleted by `finally`, and the results JSON is the one place left to see it. `evolving-scope`'s
// own review records both campaigns terminating at step 0: the failing run has been the normal
// one throughout this change.
test('important-2: a run that throws still reports what it approved before failing', async () => {
  const invoke = ({ cwd }) => {
    spawnSync(process.execPath, [BIN, 'new', 'partial-approve'], { cwd, encoding: 'utf8' });
    deScaffoldArtifacts(cwd, 'partial-approve', ['spec']);
    commit(cwd, 'draft partial-approve');
    const env = { ...process.env, AIDLC_UNATTENDED: '1' };
    const approved = spawnSync(process.execPath, [BIN, 'approve', 'partial-approve', 'spec', '--by', 'unattended-eval-run'], { cwd, encoding: 'utf8', env });
    assert.equal(approved.status, 0, approved.stderr);
    throw new Error('sprint 3 exploded');
  };
  const out = await runSuite({
    tasks: [{ id: 'throws-after-approving', fixture: 'clean-app', prompt: 'x', repeats: 1, timeoutMs: 1000, budgetUsd: 1,
      assert: [{ workdir_unchanged: false }] }],
    invoke, fixturesDir: FIXTURES, harnessBin: BIN,
  });
  assert.equal(out.results[0].verdict, 'fail');
  assert.deepEqual(out.results[0].unattended, ['partial-approve/spec.md']);
  assert.deepEqual(out.results[0].runs[0].unattended, ['partial-approve/spec.md']);
});
