// G17. A consumer's pull request gets the deterministic checks as its gate and an independent
// review as one comment.
//
// The comment is advice. What this file pins down is that it stays advice: the harness posts a
// comment and nothing else — no review, no approval, no status check — because a machine that
// could satisfy a review requirement would not be a review requirement. And that it stays
// readable: a finding already posted on this pull request is not posted again, because a bot that
// repeats itself on every push is a bot people mute, and a muted reviewer reviews nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  fingerprint, postedFingerprints, dedupeFindings, renderReviewComment, parseFindings,
  shouldComment, ghComments, postComment, reviewSchema, SCHEMA_FILE,
} from '../.claude/harness/lib/pr-review.mjs';
import { reviewArgs } from '../.claude/harness/lib/review.mjs';
import { BIN, ROOT, A } from './_paths.mjs';

// A stored review, in the shape the schema describes. Two findings, one of them a nit.
const REVIEW = {
  verdict: 'changes-requested',
  findings: [
    { severity: 'blocking', file: 'src/ledger.ts', line: 44, title: 'Rejected promise is dropped',
      detail: 'The `catch` returns undefined, so a failed write reports success.',
      detected_pattern: 'unchecked-error-path', fix: 'propagate it, or record the failure where a caller can see it' },
    { severity: 'nit', file: 'src/ledger.ts', line: 9, title: 'Shadowed name',
      detail: '`entry` shadows the outer binding.', detected_pattern: 'shadowed-binding' },
  ],
  limitations: ['No tests were run by this reviewer.', 'Only the diff and the exported snapshot were read.'],
};

test('the schema ships, parses, and names the fields the pipeline reads', () => {
  const schema = JSON.parse(reviewSchema());
  assert.equal(existsSync(path.join(A, SCHEMA_FILE)), true);
  assert.deepEqual(schema.required.sort(), ['findings', 'verdict']);
  const finding = schema.properties.findings.items;
  for (const field of ['severity', 'file', 'title', 'detail', 'detected_pattern']) {
    assert.ok(finding.required.includes(field), `${field} must be required, or a finding can arrive unplaceable`);
  }
  assert.deepEqual(schema.properties.verdict.enum, ['approve', 'changes-requested']);
  // The slug is what lets a repeat class be counted rather than rediscovered, so the schema has
  // to say that to the model that fills it in.
  assert.match(finding.properties.detected_pattern.description, /same defect on a later pull request must produce the same slug/);

  // The schema reaches the CLI as an argument, so a review that returns prose fails at the CLI
  // rather than three steps downstream in a parser.
  const args = reviewArgs({ model: 'm', prompt: 'p', budgetUsd: 1, schema: reviewSchema() });
  assert.equal(args[args.indexOf('--json-schema') + 1], reviewSchema());
  assert.ok(!reviewArgs({ model: 'm', prompt: 'p', budgetUsd: 1 }).includes('--json-schema'));
});

test('a review that is not the agreed shape is refused rather than half-read', () => {
  assert.deepEqual(parseFindings(JSON.stringify(REVIEW)).findings.length, 2);
  assert.equal(parseFindings(JSON.stringify({ verdict: 'approve', findings: [] })).verdict, 'approve');
  for (const bad of [
    'plain prose, no JSON at all',
    JSON.stringify({ findings: [] }),
    JSON.stringify({ verdict: 'maybe', findings: [] }),
    JSON.stringify({ verdict: 'approve', findings: [{ severity: 'blocking', file: 'a.ts' }] }),
    JSON.stringify({ verdict: 'approve', findings: [{ severity: 'shrug', file: 'a.ts', title: 't', detected_pattern: 'p' }] }),
  ]) {
    assert.throws(() => parseFindings(bad), /schema|verdict|missing a field/, bad.slice(0, 40));
  }
});

test('a finding already posted on this pull request is not posted again', () => {
  const first = dedupeFindings(REVIEW.findings, []);
  assert.equal(first.fresh.length, 2);
  assert.equal(first.repeated.length, 0);

  const body = renderReviewComment({ ...first, findings: first.fresh, verdict: REVIEW.verdict,
    limitations: REVIEW.limitations, base: 'a'.repeat(40), candidate: 'b'.repeat(40), model: 'claude-opus-5' });

  // The same review, run again on the next push: nothing new to say.
  const second = dedupeFindings(REVIEW.findings, [body]);
  assert.equal(second.fresh.length, 0);
  assert.equal(second.repeated.length, 2);
  assert.equal(shouldComment({ ...second, comments: [body] }), false, 'a bot that repeats itself is a bot people mute');

  // One new finding among the old ones: one comment, carrying only the new one.
  const withNew = [...REVIEW.findings, { severity: 'important', file: 'src/http.ts', line: 3,
    title: 'Unbounded retry', detail: 'No ceiling.', detected_pattern: 'unbounded-retry' }];
  const third = dedupeFindings(withNew, [body]);
  assert.equal(third.fresh.length, 1);
  assert.equal(third.fresh[0].title, 'Unbounded retry');
  assert.equal(shouldComment({ ...third, comments: [body] }), true);

  // A defect that moved down the file is the same defect. The fingerprint deliberately excludes
  // the line, because re-posting on every shift is how the comment stops being read.
  const moved = REVIEW.findings.map((f) => ({ ...f, line: (f.line ?? 0) + 30 }));
  assert.equal(dedupeFindings(moved, [body]).fresh.length, 0);

  // And a different defect in the same file is not the same defect.
  assert.notEqual(fingerprint(REVIEW.findings[0]), fingerprint({ ...REVIEW.findings[0], detected_pattern: 'other' }));
  assert.equal(postedFingerprints([body]).size, 2);
});

test('the comment says what it found, what it could not, and that it is not the gate', () => {
  const { fresh, repeated } = dedupeFindings(REVIEW.findings, []);
  const body = renderReviewComment({ findings: fresh, repeated, verdict: REVIEW.verdict,
    limitations: REVIEW.limitations, base: 'abc1234def', candidate: 'fed4321cba', model: 'claude-opus-5' });

  assert.match(body, /Verdict: \*\*changes-requested\*\*/);
  assert.match(body, /abc1234/);
  assert.match(body, /### Blocking/);
  assert.match(body, /### Nit/);
  assert.match(body, /Rejected promise is dropped/);
  assert.match(body, /pattern: `unchecked-error-path`/);
  assert.match(body, /_Fix:_ propagate it/);
  assert.match(body, /No tests were run by this reviewer/);
  assert.match(body, /What this review could not establish/);
  // The claim that matters: it is not the merge gate, and it says so where a reader will see it.
  assert.match(body, /does not approve and it cannot/);
  assert.match(body, /Branch protection and a code-owner review are the merge gate/);
  // Blocking is rendered before nit, so the first thing read is the thing that matters most.
  assert.ok(body.indexOf('### Blocking') < body.indexOf('### Nit'));

  const clean = renderReviewComment({ findings: [], verdict: 'approve', base: 'a', candidate: 'b', model: 'm' });
  assert.match(clean, /No findings\./);
  assert.equal(shouldComment({ fresh: [], repeated: [], comments: [] }), true, 'one record that a clean review ran');
  assert.equal(shouldComment({ fresh: [], repeated: [], comments: [clean] }), false, 'and not a second one');
});

test('the gh transport reads comments and posts one, and reports a failure as a failure', () => {
  const calls = [];
  const ok = (stdout) => (cmd, args, options) => { calls.push({ cmd, args, options }); return { status: 0, stdout }; };

  const comments = ghComments({ repo: 'team/product', pr: 7,
    run: ok(JSON.stringify({ comments: [{ body: 'first' }, { body: 'second' }] })) });
  assert.deepEqual(comments, ['first', 'second']);
  assert.deepEqual(calls[0].args, ['pr', 'view', '7', '--repo', 'team/product', '--json', 'comments']);

  postComment({ repo: 'team/product', pr: 7, body: 'hello', run: ok('https://github.com/team/product/pull/7#issuecomment-1') });
  assert.deepEqual(calls[1].args, ['pr', 'comment', '7', '--repo', 'team/product', '--body-file', '-']);
  assert.equal(calls[1].options.input, 'hello');
  // Never a review, never an approval, never a status check: those are the gate, and this is not.
  for (const call of calls) {
    assert.ok(!call.args.includes('review'), 'the harness must not submit a pull request review');
    assert.ok(!call.args.includes('--approve'), 'the harness must not approve');
    assert.ok(!call.args.includes('merge'), 'the harness must not merge');
  }

  assert.throws(() => ghComments({ repo: 'r', pr: 1, run: () => ({ status: 1, stderr: 'nope' }) }), /gh authentication/);
  assert.throws(() => ghComments({ repo: 'r', pr: 1, run: () => ({ status: 0, stdout: 'not json' }) }), /malformed JSON/);
  assert.throws(() => postComment({ repo: 'r', pr: 1, body: 'x', run: () => ({ status: 1, stderr: 'denied' }) }), /could not post/);
});

test('the CLI refuses to comment without a pull request, and refuses to post a partial review', () => {
  const usage = spawnSync(process.execPath, [BIN, 'review', '--comment'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /--repo <owner\/name> --pr <number>/);

  // The source states the other half: an incomplete review posts nothing. A partial review
  // rendered as a comment would read exactly like a complete one that found less.
  const cli = readFileSync(BIN, 'utf8');
  assert.match(cli, /review incomplete \(\$\{result\.reason\}\); no comment posted/);
});

test('init --ci writes the consumer workflow, keeps one the project already has, and names the gate', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'consumer-ci-'));
  try {
    const run = (...args) => spawnSync(process.execPath, [BIN, 'init', '--into', root, ...args], { cwd: root, encoding: 'utf8' });
    assert.equal(run().status, 0);
    const workflow = path.join(root, '.github/workflows/harness.yml');
    assert.equal(existsSync(workflow), false, 'init must not write CI unless asked');

    assert.equal(run('--ci').status, 0);
    assert.ok(existsSync(workflow));
    const text = readFileSync(workflow, 'utf8');
    assert.match(text, /pull_request/);
    assert.match(text, /harness check --stage fast/);
    assert.match(text, /harness review --comment/);
    assert.match(text, /pull-requests: write/);
    assert.doesNotMatch(text, /contents: write/, 'the workflow needs no write access to the repository');
    assert.match(text, /branch protection/i);
    assert.match(text, /CLAUDE_CODE_OAUTH_TOKEN/);
    // A missing credential must not look like a clean review.
    assert.match(text, /no independent review ran/);

    // A CI file is the project's own. A generator that rewrote it would take that back on every
    // install, so a second run keeps what is there and says so.
    writeFileSync(workflow, '# edited by the project\n');
    const second = run('--ci');
    assert.equal(readFileSync(workflow, 'utf8'), '# edited by the project\n');
    assert.match(second.stderr, /it is yours/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
