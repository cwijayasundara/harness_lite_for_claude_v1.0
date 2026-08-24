// The one part of the eval suite that talks to the outside world, and therefore the one part
// the fake-invoker tests could never reach. Exercised here against a stub `claude` on PATH:
// no key, no spend, and every branch of the real code path actually runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { claudeInvoker } from '../evals/lib/invoker.mjs';

// Installs a fake `claude` at the front of PATH and returns where it logs its argv.
function withStub(body, script) {
  const dir = mkdtempSync(path.join(tmpdir(), 'stub-claude-'));
  const argvLog = path.join(dir, 'argv.txt');
  writeFileSync(path.join(dir, 'claude'), `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > ${JSON.stringify(argvLog)}\n${script ?? body}\n`);
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
    assert.deepEqual(argv.slice(-6), ['--output-format', 'json', '--plugin-dir', '/plugins/lean', '--max-budget-usd', '0.75']);
    assert.match(out.transcript, /I fixed the divide bug\./);
    assert.equal(out.usage.usd, 0.0234);
    assert.equal(out.usage.output_tokens, 871);
    assert.equal(out.exitCode, 0);
    assert.equal(out.timedOut, false);
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
    const { fileURLToPath } = await import('node:url');
    const C = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
    await assert.rejects(
      () => runSuite({
        tasks: [{ id: 'a', fixture: 'clean-app', prompt: 'p', repeats: 1, timeoutMs: 5000, budgetUsd: 1, assert: [{ workdir_unchanged: true }] }],
        invoke: claudeInvoker({}), fixturesDir: path.join(C, 'evals', 'fixtures'), harnessBin: path.join(C, 'bin', 'harness'),
      }),
      /not on PATH/,
    );
  } finally { process.env.PATH = previous; rmSync(dir, { recursive: true, force: true }); }
});

test('the real claude CLI is present, so the suite can run when a key is supplied', () => {
  const r = spawnSync('bash', ['-lc', 'command -v claude'], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'no `claude` on PATH — the eval suite cannot run here');
  assert.ok(existsSync(r.stdout.trim()));
});
