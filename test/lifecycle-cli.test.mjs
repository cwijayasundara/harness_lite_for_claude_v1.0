import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { C } from './_paths.mjs';

const BIN = path.join(C, 'bin', 'harness');
const run = (root, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' });

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'harness-cli-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['config', 'user.email', 'harness@example.invalid'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 'Harness Test'], { cwd: root });
  assert.equal(run(root, 'init', '--into', root).status, 0);
  return root;
}

test('new rejects path traversal and non-canonical artifact slugs', () => {
  const root = repo();
  try {
    for (const slug of ['../escape', '/absolute', 'Uppercase', 'two words', 'a'.repeat(64)]) {
      const result = run(root, 'new', 'intent', slug);
      assert.equal(result.status, 2, slug);
      assert.match(result.stderr, /slug must be/);
    }
    assert.equal(existsSync(path.join(root, 'escape.md')), false);
    assert.equal(run(root, 'new', 'intent', 'safe-change').status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('status fails when approval text has not entered git history', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'new', 'intent', 'uncommitted-gate').status, 0);
    const file = path.join(root, '.claude/artifacts/intent/uncommitted-gate.md');
    writeFileSync(file, readFileSync(file, 'utf8').replace('Status:** draft', 'Status:** approved'));
    const result = run(root, 'status', 'uncommitted-gate');
    assert.equal(result.status, 1);
    assert.match(result.stdout, /approval is not committed/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('init is idempotent and installs a checkout-independent runtime', () => {
  const root = repo();
  try {
    const config = path.join(root, '.claude/harness.toml');
    writeFileSync(config, readFileSync(config, 'utf8').replace('CHANGE-ME', 'preserved-name'));
    assert.equal(run(root, 'init', '--into', root).status, 0);
    assert.match(readFileSync(config, 'utf8'), /preserved-name/);
    const shim = path.join(root, '.claude/bin/harness');
    chmodSync(shim, 0o755);
    const text = readFileSync(shim, 'utf8');
    assert.doesNotMatch(text, new RegExp(C.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(existsSync(path.join(root, '.claude/runtime/lib/config.mjs')));
    const doctor = spawnSync(shim, ['doctor'], { cwd: root, encoding: 'utf8' });
    assert.equal(doctor.status, 0);
    assert.match(doctor.stdout, /preserved-name/);
    assert.match(doctor.stdout, /secrets\s+\[built-in\]/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a committed incident reaches its same-slug intent within SLA', () => {
  const root = repo();
  try {
    const now = new Date(); const detected = new Date(now.getTime() - 30 * 60000);
    assert.equal(run(root, 'new', 'incident', 'service-outage').status, 0);
    assert.equal(run(root, 'new', 'intent', 'service-outage').status, 0);
    const incident = path.join(root, '.claude/artifacts/incident/service-outage.md');
    writeFileSync(incident, readFileSync(incident, 'utf8').replace(/Detected at:\*\* .+/, `Detected at:** ${detected.toISOString()}`));
    const intent = path.join(root, '.claude/artifacts/intent/service-outage.md');
    writeFileSync(intent, readFileSync(intent, 'utf8').replace('Status:** draft', 'Status:** approved'));
    spawnSync('git', ['add', '.'], { cwd: root });
    const committed = spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'incident to intent'], { cwd: root, env: { ...process.env, GIT_AUTHOR_DATE: now.toISOString(), GIT_COMMITTER_DATE: now.toISOString() } });
    assert.equal(committed.status, 0, committed.stderr);
    const result = run(root, 'status', '--json');
    assert.equal(result.status, 0, result.stdout);
    const body = JSON.parse(result.stdout);
    assert.equal(body.incidents[0].valid, true);
    assert.equal(body.incidents[0].sla, 'within');
    assert.ok(body.incidents[0].elapsed_minutes <= 60);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('status reports playbook indicators from git history and eval results', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'new', 'intent', 'kept-change').status, 0);
    assert.equal(run(root, 'new', 'intent', 'dropped-change').status, 0);
    const kept = path.join(root, '.claude/artifacts/intent/kept-change.md');
    const dropped = path.join(root, '.claude/artifacts/intent/dropped-change.md');
    writeFileSync(kept, readFileSync(kept, 'utf8').replace('Status:** draft', 'Status:** approved'));
    writeFileSync(dropped, readFileSync(dropped, 'utf8').replace('Status:** draft', 'Status:** closed'));
    spawnSync('git', ['add', '.'], { cwd: root });
    spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'decide intents'], { cwd: root });

    mkdirSync(path.join(root, '.claude/evals/results'), { recursive: true });
    writeFileSync(path.join(root, '.claude/evals/results/2026-08-24T04-01-22-046Z.json'), JSON.stringify({ summary: { total: 20, pass: 14 } }));
    writeFileSync(path.join(root, '.claude/evals/results/2026-08-24T04-41-43-578Z.json'), JSON.stringify({ summary: { total: 1, pass: 1 } }));

    const result = run(root, 'status', '--json');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.playbook.intent_survival.approved, 1);
    assert.equal(body.playbook.intent_survival.closed, 1);
    assert.equal(body.playbook.intent_survival.rate, 0.5);
    assert.equal(body.playbook.eval_pass_rate.pass, 14);
    assert.equal(body.playbook.eval_pass_rate.total, 20);
    assert.equal(body.playbook.eval_pass_rate.rate, 0.7);
    const text = run(root, 'status');
    assert.match(text.stdout, /playbook/);
    assert.match(text.stdout, /intent survival/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
