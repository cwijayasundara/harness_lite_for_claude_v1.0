// The one part of the eval suite that talks to the outside world, and therefore the one part
// the fake-invoker tests could never reach. Exercised here against a stub `claude` on PATH:
// no key, no spend, and every branch of the real code path actually runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { C, ROOT } from './_paths.mjs';
import { spawnSync } from 'node:child_process';
import { claudeInvoker } from '../evals/lib/invoker.mjs';

// Installs a fake `claude` at the front of PATH and returns where it logs its argv.
function withStub(body, script) {
  const dir = mkdtempSync(path.join(tmpdir(), 'stub-claude-'));
  const argvLog = path.join(dir, 'argv.txt');
  writeFileSync(path.join(dir, 'claude'), `#!/usr/bin/env bash\nif [ "$1" = auth ]; then echo '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}'; exit 0; fi\nprintf '%s\\n' "$@" > ${JSON.stringify(argvLog)}\n${script ?? body}\n`);
  chmodSync(path.join(dir, 'claude'), 0o755);
  const previous = process.env.PATH;
  process.env.PATH = `${dir}:${previous}`;
  return { dir, argvLog, restore: () => { process.env.PATH = previous; rmSync(dir, { recursive: true, force: true }); } };
}

test('invoker: builds the argv the CLI expects and extracts usage from its JSON', () => {
  const stub = withStub(`echo '{"result":"I fixed the divide bug.","total_cost_usd":0.0234,"usage":{"output_tokens":871}}'`);
  try {
    const out = claudeInvoker({ pluginDir: '/plugins/lean' })({
      prompt: 'Fix the divide bug.', cwd: stub.dir, timeoutMs: 30000, budgetUsd: 0.75,
    });
    const argv = readFileSync(stub.argvLog, 'utf8').split('\n').filter(Boolean);
    assert.deepEqual(argv.slice(0, 2), ['-p', 'Fix the divide bug.']);
    // Evals run against a disposable mkdtemp copy; permission prompts there measure the CLI,
    // not the guides. Six tasks failed that way before this was measured.
    assert.ok(argv.includes('--dangerously-skip-permissions'));
    // Inert without its enabler: edits are denied and the task fails with an empty transcript.
    assert.ok(argv.includes('--allow-dangerously-skip-permissions'));
    const outputIndex = argv.indexOf('--output-format');
    assert.deepEqual(argv.slice(outputIndex, outputIndex + 6), ['--output-format', 'json', '--plugin-dir', '/plugins/lean', '--max-budget-usd', '0.75']);
    assert.equal(JSON.parse(argv[argv.indexOf('--settings') + 1]).forceLoginMethod, 'claudeai');
    assert.equal(argv[argv.indexOf('--max-turns') + 1], '30');
    assert.match(out.transcript, /I fixed the divide bug\./);
    assert.equal(out.usage.usd, 0.0234);
    assert.equal(out.usage.output_tokens, 871);
    assert.equal(out.exitCode, 0);
    assert.equal(out.timedOut, false);
  } finally { stub.restore(); }
});

// B1/B2. On 2026-09-02 `no-secret-commit` and `pin-before-edit` both hit --max-budget-usd
// mid-task. The CLI returned is_error with no `result`, so the transcript became a dump of
// token counts and every transcript assertion failed — while the behavioural assertions on the
// same two tasks passed, because the work had been done. Budget exhaustion was reported as
// model failure. Same law as the ENOENT branch: a grader that could not finish is not a verdict.
test('invoker: a run that exhausts its budget is incomplete, not a transcript', () => {
  const stub = withStub(`echo '{"type":"result","subtype":"error_max_budget_usd","is_error":true,"terminal_reason":"budget_exhausted","errors":["Reached maximum budget ($0.6)"],"num_turns":7,"total_cost_usd":0.6}'`);
  try {
    const out = claudeInvoker({})({ prompt: 'p', cwd: stub.dir, timeoutMs: 5000, budgetUsd: 0.6 });
    assert.ok(out.incomplete, 'an exhausted run must be flagged incomplete');
    assert.equal(out.incomplete.reason, 'budget_exhausted');
    assert.match(out.incomplete.detail, /Reached maximum budget/);
    assert.equal(out.incomplete.turns, 7);
    // B2: never hand a metadata dump to the assertion engine dressed as model output.
    assert.equal(out.transcript, '');
    assert.equal(out.usage.usd, 0.6, 'the spend still counts');
  } finally { stub.restore(); }
});

test('invoker: a normal run is not flagged incomplete', () => {
  const stub = withStub(`echo '{"type":"result","is_error":false,"result":"done","total_cost_usd":0.01}'`);
  try {
    const out = claudeInvoker({})({ prompt: 'p', cwd: stub.dir, timeoutMs: 5000 });
    assert.equal(out.incomplete, null);
    assert.match(out.transcript, /done/);
  } finally { stub.restore(); }
});

test('invoker: the budget flag is omitted rather than sent as zero', () => {
  const stub = withStub(`echo '{"result":"ok"}'`);
  try {
    claudeInvoker({})({ prompt: 'p', cwd: stub.dir, timeoutMs: 5000 });
    const argv = readFileSync(stub.argvLog, 'utf8');
    assert.doesNotMatch(argv, /--max-budget-usd/);
    assert.doesNotMatch(argv, /--plugin-dir/);
  } finally { stub.restore(); }
});

test('invoker: non-JSON output is still graded, not discarded', () => {
  const stub = withStub(`echo 'plain text, no envelope'; exit 0`);
  try {
    const out = claudeInvoker({})({ prompt: 'p', cwd: stub.dir, timeoutMs: 5000 });
    assert.match(out.transcript, /plain text, no envelope/);
    assert.deepEqual(out.usage, {});
  } finally { stub.restore(); }
});

test('invoker: a non-zero exit is reported, with stderr kept in the transcript', () => {
  const stub = withStub(`echo 'boom' >&2; exit 3`);
  try {
    const out = claudeInvoker({})({ prompt: 'p', cwd: stub.dir, timeoutMs: 5000 });
    assert.equal(out.exitCode, 3);
    assert.match(out.transcript, /boom/);
  } finally { stub.restore(); }
});

test('invoker: a hang is reported as timedOut, not as a silent pass', () => {
  const stub = withStub(`sleep 5`);
  try {
    const out = claudeInvoker({})({ prompt: 'p', cwd: stub.dir, timeoutMs: 300 });
    assert.equal(out.timedOut, true);
  } finally { stub.restore(); }
});

test('invoker: a missing CLI is a broken harness, not twenty failed tasks', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'empty-path-'));
  const previous = process.env.PATH;
  process.env.PATH = dir;                       // nothing on PATH at all
  try {
    const out = claudeInvoker({})({ prompt: 'p', cwd: dir, timeoutMs: 5000 });
    assert.equal(out.notInstalled, true);
    assert.match(out.error, /not on PATH/);

    // And the suite stops on it rather than grinding through every task with empty transcripts.
    const { runSuite } = await import('../evals/run.mjs');
    await assert.rejects(
      () => runSuite({
        tasks: [{ id: 'a', fixture: 'clean-app', prompt: 'p', repeats: 1, timeoutMs: 5000, budgetUsd: 1, assert: [{ workdir_unchanged: true }] }],
        invoke: claudeInvoker({}), fixturesDir: path.join(ROOT, 'evals', 'fixtures'), harnessBin: path.join(C, 'bin', 'harness'),
      }),
      /not on PATH/,
    );
  } finally { process.env.PATH = previous; rmSync(dir, { recursive: true, force: true }); }
});

test('the real claude CLI is present for explicitly requested subscription trials', () => {
  const r = spawnSync('bash', ['-lc', 'command -v claude'], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'no `claude` on PATH — the eval suite cannot run here');
  assert.ok(existsSync(r.stdout.trim()));
});

// B5. The container boundary. A product trial has no host keychain, so whatever crosses this
// line is the whole of what it can bill. Before this change the list also carried
// ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN and ANTHROPIC_BASE_URL, which meant an isolated trial
// could bill an API account or a gateway while the harness reported it as a subscription run.
function withStubDocker(body) {
  const dir = mkdtempSync(path.join(tmpdir(), 'stub-docker-'));
  const argvLog = path.join(dir, 'argv.txt');
  writeFileSync(path.join(dir, 'docker'),
    `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > ${JSON.stringify(argvLog)}\necho '{"result":"ok","total_cost_usd":0}'\n`);
  chmodSync(path.join(dir, 'docker'), 0o755);
  const previousPath = process.env.PATH;
  const previousEnv = { ...process.env };
  process.env.PATH = `${dir}:${previousPath}`;
  try { return body(dir, argvLog); } finally {
    process.env.PATH = previousPath;
    for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
    for (const [key, value] of Object.entries(previousEnv)) process.env[key] = value;
    rmSync(dir, { recursive: true, force: true });
  }
}

const sandboxFixture = dir => ({
  work: path.join(dir, 'work'), home: path.join(dir, 'home'), plugin: path.join(dir, 'plugin'),
  data: path.join(dir, 'data'), image: 'lean-harness-product:test', native: false,
});

test('invoker: only the subscription token crosses into the product container', () => {
  withStubDocker((dir, argvLog) => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_BASE_URL;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'oauth-fixture-value';

    claudeInvoker({ pluginDir: path.join(dir, 'plugin'), model: 'claude-sonnet-5' })({
      prompt: 'implement the slice', cwd: dir, timeoutMs: 30000, budgetUsd: 1,
      sandbox: sandboxFixture(dir), phase: 'plan',
    });

    const argv = readFileSync(argvLog, 'utf8').split('\n').filter(Boolean);
    const forwarded = argv.filter((a, i) => argv[i - 1] === '--env');
    assert.ok(forwarded.includes('CLAUDE_CODE_OAUTH_TOKEN'),
      `the subscription token must reach the container: ${forwarded.join(' ')}`);
    // Passed by name, so the value is never written into an argument list a process listing shows.
    assert.doesNotMatch(readFileSync(argvLog, 'utf8'), /oauth-fixture-value/);
    for (const denied of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL']) {
      assert.ok(!forwarded.some(f => f.startsWith(denied)), `${denied} must not cross the boundary`);
    }
  });
});

test('invoker: a product trial with an API key present refuses before starting a container', () => {
  withStubDocker((dir, argvLog) => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'oauth-fixture-value';
    process.env.ANTHROPIC_API_KEY = 'sk-fixture-never-spend';

    assert.throws(() => claudeInvoker({ pluginDir: path.join(dir, 'plugin'), model: 'claude-sonnet-5' })({
      prompt: 'implement the slice', cwd: dir, timeoutMs: 30000, budgetUsd: 1,
      sandbox: sandboxFixture(dir), phase: 'plan',
    }), /API billing is disabled/);

    assert.ok(!existsSync(argvLog), 'no container may be started once a conflicting credential is present');
  });
});
