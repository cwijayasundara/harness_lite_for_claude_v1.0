import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { stage, FIXTURES } from '../evals/lib/stage.mjs';
import { hostReview, review, reviewTimeoutMs, REVIEW_TIMEOUT } from '../.claude/harness/lib/review.mjs';
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

// G02. The reviewer's allowance follows the diff it has to read, the export it reads is scoped to
// the change, and a run that outlives its allowance reports what it got instead of throwing away
// both the findings and the spend.
test('the review timeout is derived from the diff: a floor, a per-KB allowance and a cap', () => {
  assert.equal(reviewTimeoutMs(0), REVIEW_TIMEOUT.floorMs);
  assert.equal(reviewTimeoutMs(1), REVIEW_TIMEOUT.floorMs + REVIEW_TIMEOUT.perKbMs, 'a partial KB is a whole allowance');
  assert.equal(reviewTimeoutMs(17 * 1024), REVIEW_TIMEOUT.floorMs + 17 * REVIEW_TIMEOUT.perKbMs);
  assert.ok(reviewTimeoutMs(17 * 1024) > 180000, 'the 17 KB diff that timed out under the old hardcoded 180 s now fits');
  assert.equal(reviewTimeoutMs(64 * 1024 * 1024), REVIEW_TIMEOUT.capMs, 'a runaway diff stops at the cap');
  assert.equal(reviewTimeoutMs(-1), REVIEW_TIMEOUT.floorMs);
  assert.ok(REVIEW_TIMEOUT.floorMs === 300000 && REVIEW_TIMEOUT.capMs === 900000);
});

function exported(dir) {
  const out = [];
  const walk = (rel) => {
    for (const entry of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const next = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(next); else out.push(next);
    }
  };
  walk('');
  return out.sort();
}

function candidateRepo() {
  const s = stage(FIXTURES, 'contract-planned');
  const git = (...a) => execFileSync('git', a, { cwd: s.work, encoding: 'utf8' }).trim();
  const base = git('rev-parse', 'HEAD');
  const text = path.join(s.work, 'src/app/text.py');
  writeFileSync(text, readFileSync(text, 'utf8').replace('value.split(" ")', 'value.replace("-", " ").split(" ")'));
  git('add', '-A');
  git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'candidate');
  return { ...s, git, base, candidate: git('rev-parse', 'HEAD') };
}

test('the review export is scoped to the plan, its importers, the tests naming it and the change artifacts', () => {
  const s = candidateRepo();
  try {
    const plan = { planFiles: ['src/app/text.py', 'tests/test_app.py'],
      contextPaths: ['.claude/harness/artifacts/hyphen-titlecase'],
      // The import edge the graph supplies. Passed in rather than built so this asserts the
      // scoping rule, not the graph's Python heuristics.
      modules: { 'src/app/handlers.py': { imports: ['src/app/text.py'] } } };
    let tree = null;
    const invoke = () => ({ status: 0, stdout: JSON.stringify({ result: 'No findings. approve', total_cost_usd: 0.25 }) });
    const capture = (args, options) => { tree = exported(path.join(options.cwd, 'candidate')); return invoke(); };

    const scoped = review({ root: s.work, base: s.base, candidate: s.candidate, model: 'test-evaluator',
      output: 'scoped.md', ...plan, invoke: capture });
    assert.deepEqual(tree, ['.claude/harness/artifacts/hyphen-titlecase/intent.md', '.claude/harness/artifacts/hyphen-titlecase/plan.md',
      '.claude/harness/artifacts/hyphen-titlecase/spec.md', 'src/app/handlers.py', 'src/app/text.py', 'tests/test_app.py']);
    assert.equal(scoped.export.scope, 'plan');
    assert.equal(scoped.status, 'complete');
    assert.match(readFileSync(path.join(s.work, 'scoped.md'), 'utf8'), /Export: scoped to 6 files/);
    // The diff is never scoped: it is the change itself.
    assert.match(readFileSync(path.join(s.work, 'scoped.md'), 'utf8'), /Status: complete/);

    review({ root: s.work, base: s.base, candidate: s.candidate, model: 'test-evaluator', output: 'full.md',
      ...plan, fullTree: true, invoke: capture });
    assert.ok(tree.includes('pyproject.toml') && tree.includes('.claude/harness/harness.toml'), '--full-tree exports the whole candidate');

    const unplanned = review({ root: s.work, base: s.base, candidate: s.candidate, model: 'test-evaluator',
      output: 'unplanned.md', planFiles: ['does/not/exist.py'], invoke: capture });
    assert.equal(unplanned.export.scope, 'full', 'a plan that names nothing in the tree falls back rather than exporting nothing');
    assert.ok(tree.includes('pyproject.toml'));
  } finally { s.cleanup(); }
});

test('a review that outlives its timeout keeps the findings and the spend and reports itself incomplete', () => {
  let killSignal = null;
  const s = candidateRepo();
  try {
    const envelope = JSON.stringify({ result: 'Blocking: text.py:5 drops the hyphen. changes-requested', total_cost_usd: 1.5 });
    let passed = null;
    const result = review({ root: s.work, base: s.base, candidate: s.candidate, model: 'test-evaluator',
      output: 'timed-out.md', timeoutMs: 1234,
      invoke(args, options) { passed = options.timeout; killSignal = options.killSignal; return { status: null, signal: 'SIGKILL', stdout: envelope, error: Object.assign(new Error('spawnSync ETIMEDOUT'), { code: 'ETIMEDOUT' }) }; } });
    assert.equal(passed, 1234, '--timeout overrides the derived allowance');
    // MEASURED 2026-09-15 (shift-swap sprint 1): the timeout fired at 314 s, the CLI ignored SIGTERM,
    // and the driver waited 2,922 s for it to finish on its own. A bound the child can decline is
    // not a bound.
    assert.equal(killSignal, 'SIGKILL', 'the timeout kills; it does not ask');
    assert.equal(result.status, 'incomplete');
    assert.equal(result.usd, 1.5, 'spend is recorded when the envelope arrived');
    const report = readFileSync(path.join(s.work, 'timed-out.md'), 'utf8');
    assert.match(report, /Status: incomplete/);
    assert.match(report, /timeout after 1234 ms/);
    assert.match(report, /changes-requested/, 'the findings the CLI did stream survive');
    assert.match(report, /Cost USD: 1.5/);

    // A stream cut before the envelope closed: no cost is reported, the partial text is kept, and
    // nothing is invented. `usd` absent is not `usd: 0` — an unreported cost is not a free one.
    const cut = review({ root: s.work, base: s.base, candidate: s.candidate, model: 'test-evaluator',
      output: 'cut.md', invoke: () => ({ status: null, signal: 'SIGTERM', stdout: '{"result":"Blocking: partial' }) });
    assert.equal(cut.status, 'incomplete');
    assert.equal(cut.usd, undefined);
    assert.match(readFileSync(path.join(s.work, 'cut.md'), 'utf8'), /Cost USD: unreported/);
    assert.match(readFileSync(path.join(s.work, 'cut.md'), 'utf8'), /Blocking: partial/);
  } finally { s.cleanup(); }
});
