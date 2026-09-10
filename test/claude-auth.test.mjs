import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { requireSubscription, subscriptionArgs } from '../.aidlc/lib/claude-auth.mjs';
import { ROOT } from './_paths.mjs';

const status = value => () => ({ status: 0, stdout: JSON.stringify(value) });
const CONFIRMED = { loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty' };

// B2. Every variable the CLI would read to select a paid route, not the three that were obvious.
// The sentinel is the point: a refusal that quotes what it found teaches the operator to paste it
// somewhere else, and a test that does not look for it will not notice when one starts to.
const CONFLICTS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY',
  'ANTHROPIC_PROFILE', 'ANTHROPIC_FEDERATION_RULE_ID', 'ANTHROPIC_ORGANIZATION_ID'];

test('subscription guard rejects API, gateway and provider credentials before invoking Claude', () => {
  const sentinel = 'sk-do-not-print-this-value';
  for (const key of CONFLICTS) {
    // An OAuth token alongside it must not resolve the conflict in the CLI's favour: which one
    // wins is the CLI's decision and is not observable from here.
    assert.throws(() => requireSubscription({
      env: { [key]: sentinel, CLAUDE_CODE_OAUTH_TOKEN: 'oauth' },
      run() { assert.fail('must not spawn the CLI once a conflicting variable is present'); },
    }), error => {
      assert.match(error.message, /API billing is disabled/);
      assert.ok(error.message.includes(key), `the refusal must name ${key}`);
      assert.doesNotMatch(error.message, new RegExp(sentinel), `${key}: the value must never be emitted`);
      return true;
    });
  }
});

test('only confirmed subscription status or a dedicated OAuth token is accepted', () => {
  assert.equal(requireSubscription({ env: {}, run: status(CONFIRMED) }), 'subscription-login');
  assert.equal(requireSubscription({ env: {}, run: status({ ...CONFIRMED, authMethod: 'oauth_token' }) }), 'subscription-login');

  for (const auth of [{ loggedIn: false }, { loggedIn: true },
    { loggedIn: true, authMethod: 'api_key', apiProvider: 'firstParty' },
    { loggedIn: true, authMethod: 'claude.ai', apiProvider: 'bedrock' }]) {
    assert.throws(() => requireSubscription({ env: {}, run: status(auth) }), /not confirmed/,
      JSON.stringify(auth));
  }

  // B3. Unrecognised authentication is unauthenticated: neither of these may read as a pass.
  assert.throws(() => requireSubscription({ env: {}, run: () => ({ status: 0, stdout: 'not json at all' }) }),
    /not confirmed/, 'unparseable CLI output must refuse');
  assert.throws(() => requireSubscription({ env: {}, run: () => ({ status: 1, stdout: JSON.stringify(CONFIRMED) }) }),
    /not confirmed/, 'a non-zero CLI exit must refuse even when the payload looks confirmed');

  assert.throws(() => requireSubscription({ env: {}, product: true }), /Container runs require/);
  assert.equal(requireSubscription({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'fixture' }, product: true }), 'subscription-token');
});

test('CLI subscription enforcement preserves existing settings and bounds turns', () => {
  const args = subscriptionArgs(['-p', 'test', '--settings', '{"disableAllHooks":true,"forceLoginMethod":"console"}']);
  assert.deepEqual(JSON.parse(args[args.indexOf('--settings') + 1]), { disableAllHooks: true, forceLoginMethod: 'claudeai' });
  assert.equal(args[args.indexOf('--max-turns') + 1], '30');

  // A call site with no --settings of its own still gets the policy.
  const bare = subscriptionArgs(['-p', 'test']);
  assert.equal(JSON.parse(bare[bare.indexOf('--settings') + 1]).forceLoginMethod, 'claudeai');

  // B6. The default is a floor, not a ceiling: a call site that has measured its own bound keeps
  // it. The 30 is provisional and this is the seam that lets it be raised without a rewrite.
  const own = subscriptionArgs(['-p', 'test', '--max-turns', '120']);
  assert.equal(own[own.indexOf('--max-turns') + 1], '120');
  assert.equal(own.filter(a => a === '--max-turns').length, 1);
});

// A stub CLI that answers `auth status` as a confirmed subscription and nothing else.
function withStubClaude(body) {
  const dir = mkdtempSync(path.join(tmpdir(), 'stub-auth-'));
  writeFileSync(path.join(dir, 'claude'),
    `#!/usr/bin/env bash\nif [ "$1" = auth ]; then echo '${JSON.stringify(CONFIRMED)}'; exit 0; fi\necho '{"result":"done","total_cost_usd":0}'\n`);
  chmodSync(path.join(dir, 'claude'), 0o755);
  try { return body(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const cleanEnv = extra => {
  const env = { ...process.env, ...extra };
  for (const key of CONFLICTS) delete env[key];
  return env;
};

test('ordinary runner invocation and dry validation never launch a live trial', () => {
  const env = { ...process.env, ANTHROPIC_API_KEY: 'fixture-never-spend' };
  const run = args => spawnSync(process.execPath, ['evals/run.mjs', ...args], { cwd: ROOT, env, encoding: 'utf8', timeout: 30000 });
  const ordinary = run([]);
  assert.equal(ordinary.status, 2);
  assert.match(ordinary.stderr, /require --live/);
  const dry = run(['--dry']);
  assert.equal(dry.status, 0, dry.stderr);
  const live = run(['--live', '--id', 'surgical-fix']);
  assert.equal(live.status, 2);
  assert.match(live.stderr, /API billing is disabled/);
  assert.doesNotMatch(live.stderr, /fixture-never-spend/);

  // B1. The mechanism smoke is the second command that used to spend by default, and it must
  // refuse the way the runner does: a sentence and an exit code, not a stack trace.
  const smoke = spawnSync(process.execPath, ['evals/agent-mechanisms.mjs'], { cwd: ROOT, env, encoding: 'utf8', timeout: 30000 });
  assert.equal(smoke.status, 2);
  assert.match(smoke.stderr, /No model calls made/);
  assert.doesNotMatch(smoke.stderr, /at Object|at Module|\.mjs:\d+/, 'a refusal is a message, not a thrown stack');
});

test('a live run reports the route it confirmed and what it did not do', () => {
  withStubClaude(dir => {
    const env = cleanEnv({ PATH: `${dir}:${process.env.PATH}` });
    // A real run of the real command, held to one task under a suite budget it cannot fit, so the
    // line under test is produced by the path an operator actually takes and the run stops there.
    const out = spawnSync(process.execPath,
      ['evals/run.mjs', '--live', '--id', 'surgical-fix', '--repeats', '1', '--max-suite-usd', '0.0001'],
      { cwd: ROOT, env, encoding: 'utf8', timeout: 60000 });
    assert.match(out.stdout, /authentication: subscription-login/, out.stderr);
    assert.match(out.stdout, /API billing disabled/);
    assert.match(out.stdout, /repository \.env not loaded/);
  });
});
