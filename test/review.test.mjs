import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { stage, FIXTURES } from '../evals/lib/stage.mjs';
import { hostReview } from '../.aidlc/lib/review.mjs';
import { BIN } from './_paths.mjs';

function fixture(sha) {
  return { nameWithOwner: 'team/product', pullRequest: {
    url: 'https://github.com/team/product/pull/1', number: 1, headRefOid: sha, baseRefOid: sha,
    reviewDecision: 'APPROVED', state: 'OPEN', mergedAt: null, mergeCommit: null,
    baseRef: { branchProtectionRule: { requiresApprovingReviews: true, requiredApprovingReviewCount: 1, requiresCodeOwnerReviews: false, requireLastPushApproval: false } },
    reviews: { totalCount: 1, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [
      { id: 'review-1', author: { login: 'reviewer' }, authorCanPushToRepository: true, state: 'APPROVED', submittedAt: '2026-09-08T00:00:00Z', commit: { oid: sha } },
    ] },
  } };
}
function transport(data) {
  return query => {
    const copy = structuredClone(data);
    if (!query.includes('reviews(first:')) delete copy.pullRequest.reviews;
    return copy;
  };
}

test('host evidence distinguishes approved policy, stale/dismissed reviews, missing policy and API failure', () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: s.work, encoding: 'utf8' }).trim();
    const options = { root: s.work, repository: 'team/product', pr: 1, candidate: sha, output: 'review.json' };
    const good = hostReview({ ...options, request: transport(fixture(sha)) });
    assert.equal(good.assessment, 'host-policy-approved');
    assert.equal(good.verified, false, 'simulated transport never authenticates a real review');
    assert.equal(good.provenance, 'simulated-transport');
    assert.equal(good.reviews[0].reviewer, 'reviewer');
    assert.equal(good.delivery, undefined);
    for (const [edit, expected] of [
      [p => p.headRefOid = '0'.repeat(40), 'candidate-mismatch'],
      [p => p.reviews.nodes[0].commit.oid = '0'.repeat(40), 'approval-not-established'],
      [p => p.reviews.nodes[0].state = 'DISMISSED', 'approval-not-established'],
      [p => p.reviews.nodes[0].authorCanPushToRepository = false, 'approval-not-established'],
      [p => p.reviewDecision = 'CHANGES_REQUESTED', 'changes-requested'],
      [p => p.baseRef = null, 'policy-unavailable'],
      [p => p.baseRef.branchProtectionRule.requiresCodeOwnerReviews = true, 'policy-unavailable'],
      [p => p.baseRef.branchProtectionRule.requireLastPushApproval = true, 'policy-unavailable'],
      [p => p.baseRef.branchProtectionRule.requiredApprovingReviewCount = 2, 'approval-not-established'],
      [p => p.reviewDecision = null, 'approval-not-established'],
    ]) {
      const data = fixture(sha); edit(data.pullRequest);
      const report = hostReview({ ...options, request: transport(data) });
      assert.equal(report.assessment, expected);
      assert.equal(report.verified, false);
    }
    const unavailable = hostReview({ ...options, request() { throw new Error('simulated unavailable API'); } });
    assert.equal(unavailable.assessment, 'unavailable');
    assert.equal(JSON.parse(readFileSync(path.join(s.work, 'review.json'))).verified, false);
    const merged = fixture(sha); Object.assign(merged.pullRequest, { state: 'MERGED', mergedAt: '2026-09-08T01:00:00Z', mergeCommit: { oid: '1'.repeat(40) } });
    assert.equal(hostReview({ ...options, request: transport(merged) }).delivery.merge, '1'.repeat(40));
  } finally { s.cleanup(); }
});

test('host evidence paginates reviews and rejects changed heads or incomplete pages', () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: s.work, encoding: 'utf8' }).trim();
    const options = { root: s.work, repository: 'team/product', pr: 1, candidate: sha, output: 'review.json' };
    const request = (query, variables) => {
      const data = transport(fixture(sha))(query);
      if (data.pullRequest.reviews) {
        const r = data.pullRequest.reviews;
        r.totalCount = 2;
        r.pageInfo = { hasNextPage: !variables.cursor, endCursor: variables.cursor ? null : 'page-2' };
        if (variables.cursor) r.nodes[0].id = 'review-2';
      }
      return data;
    };
    const report = hostReview({ ...options, request });
    assert.equal(report.assessment, 'host-policy-approved');
    assert.equal(report.reviews.length, 2);
    const race = hostReview({ ...options, request(query, variables) {
      const data = request(query, variables);
      if (variables.cursor) data.pullRequest.headRefOid = '2'.repeat(40);
      return data;
    } });
    assert.equal(race.assessment, 'unavailable');
    assert.match(race.error, /changed/);
    const missing = fixture(sha); missing.pullRequest.reviews.totalCount = 2;
    assert.equal(hostReview({ ...options, request: transport(missing) }).assessment, 'unavailable');
    let calls = 0;
    const dismissedDuringRead = hostReview({ ...options, request(query) {
      const data = transport(fixture(sha))(query);
      if (++calls > 1) data.pullRequest.reviews.nodes[0].state = 'DISMISSED';
      return data;
    } });
    assert.equal(dismissedDuringRead.assessment, 'unavailable');
    assert.match(dismissedDuringRead.error, /changed/);
    const wrongRepo = fixture(sha); wrongRepo.nameWithOwner = 'another/product';
    assert.equal(hostReview({ ...options, request: transport(wrongRepo) }).assessment, 'unavailable');
    const duplicate = fixture(sha); duplicate.pullRequest.reviews.nodes.push(duplicate.pullRequest.reviews.nodes[0]);
    duplicate.pullRequest.reviews.totalCount = 2;
    assert.match(hostReview({ ...options, request: transport(duplicate) }).error, /duplicate/);
  } finally { s.cleanup(); }
});

test('host evidence CLI records unavailable credentials without invoking a model or exposing stderr', () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const bin = path.join(s.work, 'fake-bin'); mkdirSync(bin);
    const gh = path.join(bin, 'gh');
    writeFileSync(gh, '#!/bin/sh\necho simulated-sensitive-stderr >&2\nexit 1\n'); chmodSync(gh, 0o755);
    const out = spawnSync(process.execPath, [BIN, 'review', '--repo', 'team/product', '--pr', '1', '--candidate', 'HEAD', '--out', 'review.json'], {
      cwd: s.work, encoding: 'utf8', env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH },
    });
    assert.equal(out.status, 1, out.stderr);
    const report = JSON.parse(out.stdout);
    assert.equal(report.assessment, 'unavailable');
    assert.equal(report.verified, false);
    assert.doesNotMatch(readFileSync(path.join(s.work, 'review.json'), 'utf8'), /simulated-sensitive/);
    assert.match(report.error, /authentication/);
  } finally { s.cleanup(); }
});
