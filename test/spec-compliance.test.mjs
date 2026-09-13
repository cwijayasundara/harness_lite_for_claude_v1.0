// G22. A model judgment about whether the product still promises what its approved specs say —
// and no longer promises what a later sprint reversed.
//
// The deterministic product assertions call the endpoint and check the response. They cannot see
// the other half: sprint 3 of `campaign-ledger` reverses a rule, and a product that still
// documents the old rule passes every endpoint check while telling its users something untrue.
//
// Everything here is deterministic. The model's judgment is the one part that is not, so the parts
// around it — what it is asked, how its votes are counted, what happens when it does not answer,
// and the fact that it can never override a deterministic assertion — are the parts under test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  promises, rubric, readVote, tally, gradeSpecCompliance, VOTES, MAJORITY,
} from '../evals/lib/spec-compliance.mjs';
import { render } from '../.aidlc/lib/artifacts.mjs';
import { ROOT } from './_paths.mjs';

// Two sprints, the second reversing a behaviour of the first — the shape sprint 3 of
// `campaign-ledger` has, and the only shape where the two questions differ.
function product() {
  const root = mkdtempSync(path.join(tmpdir(), 'compliance-'));
  const spec = (slug, body, front = {}) => {
    const dir = path.join(root, '.aidlc/artifacts', slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'intent.md'), `# ${slug}\n`);
    writeFileSync(path.join(dir, 'spec.md'), render({ status: 'approved', by: 'tester', at: '2026-09-13T00:00:00.000Z', ...front }, body));
  };
  spec('overdue-rule', '# Overdue\n\n### B1\nAn invoice past its due date is overdue.\n\n### B2\nAn invoice is listed once.\n');
  spec('paid-is-never-overdue', '# Paid\n\n### B1\nA fully paid invoice is never overdue, however late.\n',
    { supersedes: 'overdue-rule#B1' });
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('what the product currently promises, and what it has stopped promising', () => {
  const p = product();
  try {
    const state = promises(p.root);
    const ids = state.current.map((b) => b.id).sort();
    // The reversed behaviour is not current any more, and the one beside it still is.
    assert.deepEqual(ids, ['overdue-rule#B2', 'paid-is-never-overdue#B1']);
    assert.deepEqual(state.superseded, [{ by: 'paid-is-never-overdue', id: 'overdue-rule#B1' }]);
    // The superseded spec is never edited — this is the only place the reversal is written down.
    assert.match(readFileSync(path.join(p.root, '.aidlc/artifacts/overdue-rule/spec.md'), 'utf8'), /### B1/);
  } finally { p.cleanup(); }
});

test('the rubric asks both questions and names both lists', () => {
  const p = product();
  try {
    const text = rubric(p.root, { sprint: 3 });
    assert.match(text, /sprint 3/);
    assert.match(text, /observable in the product/);
    assert.match(text, /still presented as current/);
    assert.match(text, /- paid-is-never-overdue#B1/);
    assert.match(text, /Superseded — these must NOT be presented as current:/);
    assert.match(text, /- overdue-rule#B1 \(reversed by paid-is-never-overdue\)/);
    // The reversed behaviour must not also appear in the current list, or the grader is asked to
    // confirm and deny the same thing.
    const current = text.slice(text.indexOf('Approved and current'), text.indexOf('Superseded'));
    assert.doesNotMatch(current, /overdue-rule#B1/);
    // The half an endpoint check cannot see, said in the rubric so the grader knows to look there.
    assert.match(text, /the endpoint can be right while the README is wrong/);
  } finally { p.cleanup(); }
});

test('a vote is PASS or FAIL, and anything else is a vote that did not happen', () => {
  assert.equal(readVote('PASS — every behaviour is observable.').vote, 'pass');
  assert.equal(readVote('FAIL: README.md still documents the old rule.').vote, 'fail');
  // Both, neither, or prose with no verdict: a model that did not answer has not graded anything,
  // and counting it either way would invent the judgment this exists to obtain.
  assert.equal(readVote('It could PASS or FAIL depending on how you read it.').vote, null);
  assert.equal(readVote('I read the code and formed some impressions.').vote, null);
  assert.equal(readVote('').vote, null);
  assert.equal(readVote(undefined).vote, null);
  assert.match(readVote('FAIL: README.md is stale.').detail, /README\.md is stale/);
});

test('two of three decides, and too few readable votes is unmeasured rather than a guess', () => {
  const v = (vote) => ({ vote, detail: '' });
  assert.equal(VOTES, 3);
  assert.equal(MAJORITY, 2);

  assert.equal(tally([v('pass'), v('pass'), v('pass')]).verdict, 'pass');
  assert.equal(tally([v('pass'), v('pass'), v('fail')]).verdict, 'pass');
  assert.equal(tally([v('fail'), v('fail'), v('pass')]).verdict, 'fail');
  assert.equal(tally([v('fail'), v('fail'), v('fail')]).verdict, 'fail');

  // One sample of a model judgment is a coin with an opinion.
  assert.equal(tally([v('pass'), v(null), v(null)]).verdict, 'unmeasured');
  assert.equal(tally([v(null), v(null), v(null)]).verdict, 'unmeasured');
  assert.match(tally([v('pass'), v(null), v(null)]).why, /1 of 3 votes were readable/);

  // The votes survive the tally: a 2-1 and a 3-0 are different amounts of evidence, and a reader
  // who cannot tell them apart is reading a number that hides its own uncertainty.
  const split = tally([v('pass'), v('pass'), v('fail')]);
  assert.equal(split.pass, 2);
  assert.equal(split.fail, 1);
  assert.equal(split.votes.length, 3);
});

test('the grader casts three votes on the staged product and records every one', async () => {
  const p = product();
  try {
    const seen = [];
    const transcripts = ['PASS, all observable.', 'FAIL: README.md still says a paid invoice can be overdue.', 'PASS, all observable.'];
    const result = await gradeSpecCompliance({
      root: p.root, model: 'test-evaluator',
      async invoke(args) { seen.push(args); return { transcript: transcripts[seen.length - 1], usage: { usd: 0.01 } }; },
      sprint: 3,
    });

    assert.equal(seen.length, 3, 'three votes, because one is a coin with an opinion');
    for (const call of seen) {
      assert.equal(call.cwd, p.root, 'the grader reads the staged product, not the repository');
      assert.equal(call.model, 'test-evaluator');
      assert.equal(call.phase, 'review', 'the grader reads; it must not be able to change what it grades');
      assert.match(call.prompt, /Superseded/);
    }
    assert.equal(result.verdict, 'pass');
    assert.equal(result.pass, 2);
    assert.equal(result.fail, 1);
    assert.equal(result.sprint, 3);
    assert.equal(result.votes.length, 3);
    assert.match(result.votes[1].detail, /README\.md still says/);
    assert.equal(result.votes[0].usd, 0.01);

    // A product that still documents the reversed rule: the majority says so, and the verdict is
    // the majority's.
    const failing = await gradeSpecCompliance({
      root: p.root, model: 'test-evaluator',
      async invoke() { return { transcript: 'FAIL: README.md documents the superseded rule as current.' }; },
    });
    assert.equal(failing.verdict, 'fail');
    assert.equal(failing.fail, 3);
  } finally { p.cleanup(); }
});

test('the grader is recorded beside the deterministic proof and can never replace it', () => {
  const campaign = readFileSync(path.join(ROOT, 'evals/lib/campaign.mjs'), 'utf8');
  // It runs after the endpoint proof, pushes its own assertion, and does not touch that one.
  const block = campaign.slice(campaign.indexOf("event('product-proof'"), campaign.indexOf("event('product-proof'") + 1400);
  assert.match(block, /gradeSpecCompliance/);
  assert.match(block, /name:'spec-compliance'/);
  assert.doesNotMatch(block, /verification\s*=\s*compliance/, 'a rubric that could overwrite the endpoint proof is a way to argue a failing product into passing');
  // Unmeasured is not a failure: a grader that could not answer must not fail a product that the
  // deterministic assertions found healthy.
  assert.match(block, /pass:compliance\.verdict!=='fail'/);
});
