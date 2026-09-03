// Law 5, as a red test. You cannot argue with it; you must delete something.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { A, C, BIN } from './_paths.mjs';
import { measure, RECORD } from '../.aidlc/checks/budget.mjs';

const LIMITS = { skills: 7, agents: 3, hooks: 5, hook_loc: 600, claude_md_lines: 120 };

// An installed project, measured the way a user's CI measures it: by running the harness that
// was actually installed there. Importing `measure` directly would resolve the harness root to
// *this* repository and quietly grade the wrong tree — the exact confusion under test.
function installed() {
  const root = mkdtempSync(path.join(tmpdir(), 'harness-install-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  const r = spawnSync(process.execPath, [BIN, 'init', '--into', root], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return root;
}

// Through the generated shim, with HARNESS_HOME set — which is exactly how a project's CI runs
// the sensors on a cold clone, having fetched the harness at the commit in its install record.
function budgetOf(root, env = {}) {
  const shim = path.join(root, '.aidlc', 'bin', 'harness');
  const r = spawnSync('bash', [shim, 'check', '--stage', 'commit'], { cwd: root, encoding: 'utf8', env: { ...process.env, HARNESS_HOME: A, ...env } });
  const report = JSON.parse(readFileSync(path.join(root, '.aidlc', 'state', 'last-check.json'), 'utf8'));
  return { ...report.controls.find((c) => c.control === 'budget'), status: r.status };
}

test('the harness stays inside its own budget', () => {
  const m = measure({ layout: { aidlc: A, claude: C, claudeMd: path.join(C, 'CLAUDE.md') } });
  for (const [k, max] of Object.entries(LIMITS)) {
    assert.ok(m[k] <= max, `${k} = ${m[k]}, limit ${max}. Delete one before adding another.`);
  }
});

// The defect: five hook bindings are wired and firing in an installed project, and the budget
// reports zero because it looks for them where only a self-install keeps them.
test('an installed project measures the harness it was given', () => {
  const root = installed();
  try {
    const b = budgetOf(root);
    assert.equal(b.measured.hooks, 5, 'hook bindings');
    assert.equal(b.measured.skills, 7, 'skills');
    assert.equal(b.measured.agents, 3, 'agents');
    assert.ok(b.measured.hook_loc > 0, `hook_loc = ${b.measured.hook_loc}`);
    assert.equal(b.verdict, 'pass', 'a full harness in an empty project is exactly at budget');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// Nothing travels into the project any more — the plugin delivers every guide and every sensor,
// so there is nothing under `.claude/` to count. The installer is the only moment that holds the
// harness in its hands, so it is the moment that writes down what it saw.
test('init records what it shipped, and a self-install records nothing', () => {
  const root = installed();
  try {
    const record = path.join(root, '.aidlc', RECORD);
    assert.ok(existsSync(record), `${RECORD} was not written`);
    assert.deepEqual(JSON.parse(readFileSync(record, 'utf8')).shipped, { skills: 7, agents: 3 });
    assert.equal(existsSync(path.join(A, RECORD)), false, 'a self-install must not record itself');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// One ceiling over the total. Which side a control came from decides nothing: the twelve the
// harness supplied are spent, so the project's first skill is the thirteenth.
test('a project inherits a spent budget, not an empty one', () => {
  const root = installed();
  try {
    mkdirSync(path.join(root, '.claude', 'skills', 'my-own-skill'), { recursive: true });
    const b = budgetOf(root);
    assert.equal(b.measured.skills, 8);
    assert.equal(b.verdict, 'fail');
    assert.notEqual(b.status, 0, 'the stage must go red, not merely report');
    assert.match(JSON.stringify(b.findings), /skills = 8, limit 7/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// The defect in one assertion. A control that cannot measure must be louder than a control that
// measured zero — and `errored` will not do, because a stage is ok when nothing is `fail`.
test('a budget that cannot account for a surface is red, not green', () => {
  const root = installed();
  try {
    rmSync(path.join(root, '.aidlc', RECORD));
    const b = budgetOf(root);
    assert.equal(b.verdict, 'fail');
    assert.notEqual(b.status, 0, 'the stage must go red');
    assert.match(JSON.stringify(b.findings), /skills/, 'the finding names the surface');
    const shim = path.join(root, '.aidlc', 'bin', 'harness');
    const doctor = spawnSync('bash', [shim, 'doctor'], { cwd: root, encoding: 'utf8', env: { ...process.env, HARNESS_HOME: A } });
    assert.match(doctor.stdout, /skills=\?\/7/, 'doctor must not print a confident zero either');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// Behaviour 5: CI on a cold clone must measure what the laptop measured, so the record cannot
// live under state/ — the one path the installed .gitignore drops.
test('the record survives a clone', () => {
  const root = installed();
  try {
    spawnSync('git', ['add', '-A'], { cwd: root });
    const ignored = spawnSync('git', ['check-ignore', '-q', path.join('.aidlc', RECORD)], { cwd: root });
    assert.notEqual(ignored.status, 0, `${RECORD} is gitignored and would vanish on a cold clone`);
    const tracked = spawnSync('git', ['ls-files', path.join('.aidlc', RECORD)], { cwd: root, encoding: 'utf8' });
    assert.match(tracked.stdout, /harness-install\.json/, 'the record is not staged for commit');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// A record that cannot be refreshed is a record that goes quietly stale. Upgrading the harness
// and re-running the installer is what keeps the number honest.
test('re-running init refreshes the recorded inventory', () => {
  const root = installed();
  try {
    const record = path.join(root, '.aidlc', RECORD);
    writeFileSync(record, JSON.stringify({ shipped: { skills: 1, agents: 1 } }) + '\n');
    assert.equal(budgetOf(root).measured.skills, 1, 'the under-count should be believed first');
    const again = spawnSync(process.execPath, [BIN, 'init', '--into', root], { cwd: root, encoding: 'utf8' });
    assert.equal(again.status, 0, again.stderr);
    assert.equal(budgetOf(root).measured.skills, 7);
    assert.equal(budgetOf(root).measured.agents, 3);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// Behaviour 8: the counts come from what the installer had in its hands, never from the plugin
// cache or anything else under the user's home directory.
test('the budget reads nothing outside the project', () => {
  const root = installed();
  const home = mkdtempSync(path.join(tmpdir(), 'empty-home-'));
  try {
    const b = budgetOf(root, { HOME: home, USERPROFILE: home });
    assert.equal(b.measured.skills, 7);
    assert.equal(b.measured.agents, 3);
    assert.equal(b.measured.hooks, 5);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

// Behaviour 3: the self-install still measures itself, and still measures itself from disk —
// the recorded half must never apply here, or this repository could stop counting its own.
test('the self-install measures the harness itself, not a record', () => {
  const m = measure({ layout: { aidlc: A, claude: C, claudeMd: path.join(C, 'CLAUDE.md') } });
  assert.deepEqual({ skills: m.skills, agents: m.agents, hooks: m.hooks }, { skills: 7, agents: 3, hooks: 5 });
  assert.ok(m.hook_loc > 0, `hook_loc = ${m.hook_loc}`);
});
