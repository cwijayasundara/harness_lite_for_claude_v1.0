import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packet } from '../lib/review-adapter.mjs';
import { addWorktree } from '../lib/worktree.mjs';

const C = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BIN = path.join(C, 'bin', 'harness');
const ROOT = path.dirname(C);

test('claude-fix.yml can push but must not approve or merge', () => {
  const yml = readFileSync(path.join(ROOT, '.github/workflows/claude-fix.yml'), 'utf8');
  assert.match(yml, /@harness-fix/);
  assert.doesNotMatch(yml, /gh pr (review --approve|merge)|pull-requests:\s*admin/);
  assert.match(yml, /contents:\s*write/);
});

test('review packet prepends REVIEW.md when present', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'review-policy-'));
  try {
    const artifacts = path.join(root, '.claude/artifacts');
    const layout = { root };
    for (const kind of ['intent', 'spec', 'plan', 'review']) {
      layout[kind] = path.join(artifacts, kind); mkdirSync(layout[kind], { recursive: true });
    }
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: root });
    writeFileSync(path.join(layout.intent, 'safe-change.md'), '- **Opened at:** 2026-01-01T00:00:00Z\n- **Status:** approved\n');
    writeFileSync(path.join(layout.spec, 'safe-change.md'), '- **Status:** approved\n\n1. safe behaviour\n');
    writeFileSync(path.join(layout.plan, 'safe-change.md'), '- **Status:** approved\n\n## Files\n```\nsrc/a.js\n```\n');
    mkdirSync(path.join(root, '.claude'), { recursive: true });
    writeFileSync(path.join(root, '.claude/REVIEW.md'), '# Review instructions\nCap the nits.\n');
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'approved'], { cwd: root });
    const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    mkdirSync(path.join(root, 'src')); writeFileSync(path.join(root, 'src/a.js'), 'export const a = 1;\n');
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'impl'], { cwd: root });
    const text = packet({ layout, budget: { review_diff_max_bytes: 200000 }, sla: {} }, 'safe-change', base);
    assert.match(text, /Review policy/);
    assert.match(text, /Cap the nits/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('harness new eval writes a pending stub, doctor --enterprise prints the checklist', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'eval-cli-'));
  try {
    spawnSync('git', ['init', '-q'], { cwd: root });
    assert.equal(spawnSync(process.execPath, [BIN, 'init', '--into', root], { encoding: 'utf8' }).status, 0);
    const created = spawnSync(process.execPath, [BIN, 'new', 'eval', 'elevated-errors'], { cwd: root, encoding: 'utf8' });
    assert.equal(created.status, 0, created.stderr);
    assert.equal(JSON.parse(readFileSync(created.stdout.trim(), 'utf8')).id, 'elevated-errors');
    const doctor = spawnSync(process.execPath, [BIN, 'doctor', '--enterprise'], { cwd: root, encoding: 'utf8' });
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.match(doctor.stdout, /managed-settings/);
    assert.match(doctor.stdout, /REVIEW.md/);
    const review = spawnSync(process.execPath, [BIN, 'new', 'review', 'safe-change'], { cwd: root, encoding: 'utf8' });
    assert.equal(review.status, 0, review.stderr);
    const artifact = readFileSync(review.stdout.trim(), 'utf8');
    assert.match(artifact, /HUMAN GATE 3/);
    assert.doesNotMatch(artifact, /Cap the nits/);
    const policy = readFileSync(path.join(root, '.claude/REVIEW.md'), 'utf8');
    assert.match(policy, /Cap the nits/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('worktree adds a sibling checkout on its own branch', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'worktree-cli-'));
  try {
    spawnSync('git', ['init', '-q'], { cwd: root });
    spawnSync('git', ['config', 'user.email', 'harness@example.invalid'], { cwd: root });
    spawnSync('git', ['config', 'user.name', 'Harness Test'], { cwd: root });
    writeFileSync(path.join(root, 'README.md'), 'x\n');
    spawnSync('git', ['add', '.'], { cwd: root });
    spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'init'], { cwd: root });
    const result = addWorktree(root, 'slice-a');
    assert.ok(existsSync(result.dest));
    assert.equal(result.branch, 'harness/slice-a');
    spawnSync('git', ['worktree', 'remove', result.dest, '--force'], { cwd: root });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
