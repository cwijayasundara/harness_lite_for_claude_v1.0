// G20. A live product trial needs a boundary, and the two that exist are worth different things.
//
// `the-harness-needs-no-container` removed the container and replaced it with nothing, so the
// invoker refused every trial and the live half of the eval suite went dark. Restoring the trials
// means restoring a boundary, and the risk in doing that is not that the code is wrong — it is
// that the boundary gets described as more than it is. An ephemeral CI runner is OS-level. The
// local one is the CLI's permission system: an explicit allowlist with everything else denied,
// which constrains a cooperating agent and is not isolation.
//
// So most of this file is about what the harness says, not only what it does.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  resolveBoundary, boundaryArgs, boundaryBanner, isEphemeralRunner, BOUNDARIES, ALLOWED,
} from '../evals/lib/boundary.mjs';
import { invokerArgs } from '../evals/lib/invoker.mjs';
import { ROOT } from './_paths.mjs';

const CI_ENV = { GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '123456' };

test('a run that asks for no boundary gets none, and is told what to do about it', () => {
  const none = resolveBoundary({ requested: null, env: {} });
  assert.equal(none.ok, false);
  assert.equal(none.kind, null);
  assert.match(none.why, /needs a boundary/);
  assert.match(none.why, /--boundary local/);
  // A trial that silently picked a weaker boundary than the operator believed is the failure this
  // whole module exists to prevent, so an unknown name is refused rather than approximated.
  const wrong = resolveBoundary({ requested: 'chroot', env: {} });
  assert.equal(wrong.ok, false);
  assert.match(wrong.why, /unknown boundary "chroot"/);
  assert.deepEqual(BOUNDARIES, ['ci-runner', 'local']);
});

test('an ephemeral runner is established from the environment, never believed', () => {
  assert.equal(isEphemeralRunner(CI_ENV), true);
  // `CI=true` on a laptop is a variable somebody exported; GITHUB_ACTIONS without a run id is not
  // a hosted job either. Neither is a machine that gets destroyed afterwards.
  assert.equal(isEphemeralRunner({ CI: 'true' }), false);
  assert.equal(isEphemeralRunner({ GITHUB_ACTIONS: 'true' }), false);
  assert.equal(isEphemeralRunner({}), false);

  const runner = resolveBoundary({ requested: null, env: CI_ENV });
  assert.equal(runner.ok, true);
  assert.equal(runner.kind, 'ci-runner');
  assert.equal(runner.os, true, 'the runner is the one OS-level boundary this harness has');
  // It wins over a requested one: the job is ephemeral whatever the command line asked for.
  assert.equal(resolveBoundary({ requested: 'local', env: CI_ENV }).kind, 'ci-runner');
});

test('the local boundary is an allowlist with everything else denied, and says it is not isolation', () => {
  const local = resolveBoundary({ requested: 'local', env: {} });
  assert.equal(local.ok, true);
  assert.equal(local.os, false, 'the local boundary is policy, not isolation — claiming otherwise is the defect');
  assert.match(local.why, /policy boundary, not OS isolation/);
  assert.match(local.why, /fixtures whose code you wrote/);

  const args = boundaryArgs(local, { workdir: '/tmp/staged' });
  const value = (flag) => args[args.indexOf(flag) + 1];
  // Nothing that would prompt is granted: with no human to answer, "ask" means "deny".
  assert.equal(value('--permission-mode'), 'manual');
  assert.equal(value('--permission-prompts'), 'none');
  // An allowlist fails closed. A denylist fails open, which is the wrong direction for this.
  assert.equal(value('--allowedTools'), ALLOWED.join(','));
  for (const denied of ['curl', 'wget', 'npm install', 'ssh', 'sudo', 'git push']) {
    assert.ok(!ALLOWED.some((rule) => rule.includes(denied)), `${denied} must not be on the allowlist`);
  }
  assert.ok(ALLOWED.includes('Bash(node:*)'), 'a product trial has to be able to run the tests');
  // The operator's own settings and every MCP server stay out of a measurement.
  assert.equal(value('--setting-sources'), 'project');
  assert.ok(args.includes('--strict-mcp-config'));
  assert.equal(value('--mcp-config'), '{"mcpServers":{}}');
  // File tools reach the staged tree and nothing above it.
  assert.equal(value('--add-dir'), '/tmp/staged');

  // The CI runner needs none of this: the boundary is the machine, and the flags would be a
  // second, weaker answer to the same question.
  assert.deepEqual(boundaryArgs(resolveBoundary({ env: CI_ENV }), { workdir: '/tmp/x' }), []);
  assert.deepEqual(boundaryArgs(null, { workdir: '/tmp/x' }), []);
});

test('one place decides the permission flags, so two answers cannot disagree', () => {
  const local = resolveBoundary({ requested: 'local', env: {} });
  const withBoundary = [
    ...invokerArgs({ prompt: 'p', model: 'm', budgetUsd: 1, product: true, boundary: local }),
    ...boundaryArgs(local, { workdir: '/tmp/staged' }),
  ];
  assert.equal(withBoundary.filter((a) => a === '--permission-mode').length, 1,
    'two --permission-mode flags is two answers to "what may this run do", and the CLI takes the last');
  assert.equal(withBoundary.filter((a) => a === '--setting-sources').length, 1);
  assert.equal(withBoundary.filter((a) => a === '--mcp-config').length, 1);

  // Without a boundary the product arm still carries its own, which is what a CI runner uses.
  const without = invokerArgs({ prompt: 'p', model: 'm', budgetUsd: 1, product: true });
  assert.equal(without[without.indexOf('--permission-mode') + 1], 'acceptEdits');
});

test('the banner never lets the local boundary read as isolation', () => {
  const local = boundaryBanner(resolveBoundary({ requested: 'local', env: {} }));
  assert.match(local, /^boundary: local/);
  assert.match(local, /This is not OS isolation\. Do not run untrusted code under it\./);

  const runner = boundaryBanner(resolveBoundary({ env: CI_ENV }));
  assert.match(runner, /^boundary: ci-runner/);
  assert.doesNotMatch(runner, /not OS isolation/, 'the runner is OS-level, and saying otherwise is also wrong');

  assert.match(boundaryBanner(resolveBoundary({ env: {} })), /^no boundary:/);
});

test('the nightly job runs the live suite on the runner and uploads what it measured', () => {
  const workflow = readFileSync(path.join(ROOT, '.github/workflows/harness.yml'), 'utf8');
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /cron:/);
  assert.match(workflow, /node evals\/run\.mjs --live --max-suite-usd \d+/, 'a live suite with no ceiling is a live suite nobody bounded');
  assert.match(workflow, /harness evals gate/);
  // Non-blocking until the baseline is green: a gate that fails every night is a gate people stop
  // reading. G23 flips it, and the comment says so where whoever flips it will be looking.
  assert.match(workflow, /continue-on-error: true\s+# G23 flips this/);
  assert.match(workflow, /upload-artifact/);
  assert.match(workflow, /CLAUDE_CODE_OAUTH_TOKEN is required/, 'a missing credential must fail loudly, not quietly skip');
  // No Docker came back with the trials.
  assert.doesNotMatch(workflow, /docker/i);
});

test('the runner resolves the boundary once and prints it before anything is spent', () => {
  const runner = readFileSync(path.join(ROOT, 'evals/run.mjs'), 'utf8');
  assert.match(runner, /resolveBoundary\(\{requested: flag\('boundary'\) \?\? flag\('sandbox'\)\}\)/);
  assert.match(runner, /boundaryBanner\(boundary\)/);
  // The comparison arms are the same trials: with a boundary they run, without one every attempt
  // is the explicit unmeasured result rather than a throw.
  assert.match(runner, /const available=boundary\.ok/);
  assert.doesNotMatch(runner, /const available=false/);
});
