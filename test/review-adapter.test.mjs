import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { selectSlug, packet, validateReview, writeReview, checkProtection } from '../.aidlc/lib/review-adapter.mjs';
import { behaviourIds, contractDigest, writeEvidence } from '../.aidlc/lib/contract.mjs';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'review-adapter-'));
  const artifacts = path.join(root, '.aidlc/artifacts');
  const layout = { root, contracts: path.join(artifacts, 'contracts'), intentRefs: path.join(artifacts, 'intent-refs'), evidence: path.join(artifacts, 'evidence'), review: path.join(artifacts, 'review') };
  for (const dir of [layout.contracts, layout.intentRefs, layout.evidence, layout.review]) mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: root }); execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root }); execFileSync('git', ['config', 'user.name', 'test'], { cwd: root });
  writeFileSync(path.join(root, 'README.md'), 'base\n'); execFileSync('git', ['add', '.'], { cwd: root }); execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'base'], { cwd: root });
  const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const source = path.resolve('evals/fixtures/contract-planned/.aidlc/artifacts');
  cpSync(path.join(source, 'contracts/hyphen-titlecase.md'), path.join(layout.contracts, 'hyphen-titlecase.md'));
  cpSync(path.join(source, 'intent-refs/hyphen-titlecase.json'), path.join(layout.intentRefs, 'hyphen-titlecase.json'));
  const contract = readFileSync(path.join(layout.contracts, 'hyphen-titlecase.md'), 'utf8');
  writeEvidence(path.join(layout.evidence, 'hyphen-titlecase.json'), 'hyphen-titlecase', contractDigest(contract, 'plan'), behaviourIds(contract));
  mkdirSync(path.join(root, 'src')); writeFileSync(path.join(root, 'src/a.js'), 'export const a = 1;\n');
  execFileSync('git', ['add', '.'], { cwd: root }); execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'implementation'], { cwd: root });
  return { root, base, layout, cfg: { layout, budget: { review_diff_max_bytes: 200000 }, sla: {} }, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('review adapter selects one contract and builds a bounded packet from approvals and evidence', () => {
  const f = fixture(); try {
    assert.equal(selectSlug(f.root, f.base), 'hyphen-titlecase');
    const text = packet(f.cfg, 'hyphen-titlecase', f.base);
    assert.match(text, /Approved delivery contract/); assert.match(text, /Behaviour evidence/); assert.match(text, /export const a/); assert.match(text, /Diff truncated: false/);
  } finally { f.cleanup(); }
});

test('review validation rejects unsafe paths, inconsistent approval, and nit floods', () => {
  assert.throws(() => validateReview({ recommendation: 'approve', summary: '', findings: [{ severity: 'blocking', file: 'a.js', line: 1, message: 'bad', remedy: 'fix' }] }), /approve cannot/);
  assert.throws(() => validateReview({ recommendation: 'changes-requested', findings: [{ severity: 'important', file: '../secret', line: 1, message: 'bad', remedy: 'fix' }] }), /unsafe/);
  assert.throws(() => validateReview({ recommendation: 'changes-requested', findings: Array.from({ length: 6 }, (_, i) => ({ severity: 'nit', file: 'a.js', line: i + 1, message: `n${i}`, remedy: 'fix' })) }), /five nits/);
});

test('rendered agent review remains a draft human gate', () => {
  const f = fixture(); try {
    const result = writeReview(f.cfg, 'hyphen-titlecase', { recommendation: 'approve', summary: 'Looks aligned.', findings: [] }, { reviewer: 'bot', commit: 'abc' });
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
