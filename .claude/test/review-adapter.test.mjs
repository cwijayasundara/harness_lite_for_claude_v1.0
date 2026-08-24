import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { selectSlug, packet, validateReview, writeReview, checkProtection } from '../lib/review-adapter.mjs';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'review-adapter-'));
  const artifacts = path.join(root, '.claude/artifacts');
  const layout = { root };
  for (const kind of ['intent', 'spec', 'plan', 'review']) { layout[kind] = path.join(artifacts, kind); mkdirSync(layout[kind], { recursive: true }); }
  execFileSync('git', ['init', '-q'], { cwd: root }); execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root }); execFileSync('git', ['config', 'user.name', 'test'], { cwd: root });
  writeFileSync(path.join(layout.intent, 'safe-change.md'), '- **Opened at:** 2026-01-01T00:00:00Z\n- **Status:** approved\n');
  writeFileSync(path.join(layout.spec, 'safe-change.md'), '- **Status:** approved\n\n1. safe behaviour\n');
  writeFileSync(path.join(layout.plan, 'safe-change.md'), '- **Status:** approved\n\n## Files\n```\nsrc/a.js\n```\n');
  execFileSync('git', ['add', '.'], { cwd: root }); execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'approved artifacts'], { cwd: root });
  const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  mkdirSync(path.join(root, 'src')); writeFileSync(path.join(root, 'src/a.js'), 'export const a = 1;\n');
  writeFileSync(path.join(layout.plan, 'safe-change.md'), readFileSync(path.join(layout.plan, 'safe-change.md'), 'utf8') + '\nimplementation started\n');
  execFileSync('git', ['add', '.'], { cwd: root }); execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'implementation'], { cwd: root });
  return { root, base, layout, cfg: { layout, budget: { review_diff_max_bytes: 200000 }, sla: {} }, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('review adapter selects one plan and builds a bounded packet from committed approvals', () => {
  const f = fixture(); try {
    assert.equal(selectSlug(f.root, f.base), 'safe-change');
    const text = packet(f.cfg, 'safe-change', f.base);
    assert.match(text, /Approved spec/); assert.match(text, /export const a/); assert.match(text, /Diff truncated: false/);
  } finally { f.cleanup(); }
});

test('review validation rejects unsafe paths, inconsistent approval, and nit floods', () => {
  assert.throws(() => validateReview({ recommendation: 'approve', summary: '', findings: [{ severity: 'blocking', file: 'a.js', line: 1, message: 'bad', remedy: 'fix' }] }), /approve cannot/);
  assert.throws(() => validateReview({ recommendation: 'changes-requested', findings: [{ severity: 'important', file: '../secret', line: 1, message: 'bad', remedy: 'fix' }] }), /unsafe/);
  assert.throws(() => validateReview({ recommendation: 'changes-requested', findings: Array.from({ length: 6 }, (_, i) => ({ severity: 'nit', file: 'a.js', line: i + 1, message: `n${i}`, remedy: 'fix' })) }), /five nits/);
});

test('rendered agent review remains a draft human gate', () => {
  const f = fixture(); try {
    const result = writeReview(f.cfg, 'safe-change', { recommendation: 'approve', summary: 'Looks aligned.', findings: [] }, { reviewer: 'bot', commit: 'abc' });
    const text = readFileSync(result.file, 'utf8');
    assert.match(text, /Status:\*\* draft/); assert.match(text, /Agent recommendation:\*\* approve/); assert.doesNotMatch(text, /Status:\*\* approved/);
  } finally { f.cleanup(); }
});

test('branch protection preflight enforces independent, fresh review and required CI', () => {
  const good = { required_status_checks: { strict: true, contexts: ['harness / unit'] }, enforce_admins: { enabled: true }, required_pull_request_reviews: { required_approving_review_count: 1, dismiss_stale_reviews: true, require_last_push_approval: true } };
  assert.equal(checkProtection(good).ok, true);
  const bad = checkProtection({ required_status_checks: { strict: false, contexts: [] }, enforce_admins: { enabled: false }, required_pull_request_reviews: { required_approving_review_count: 0 } });
  assert.equal(bad.ok, false); assert.ok(bad.failures.length >= 5);
});
