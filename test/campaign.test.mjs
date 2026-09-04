// Campaign assertions: pure functions over a staged working copy, no model, no spend. If this
// file is green, a multi-sprint eval that names these checks is grading something real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unseenRequirements, modifiedNotReplaced, behavioursHaveTests } from '../evals/lib/campaign.mjs';
import { evaluate, KNOWN } from '../evals/lib/assertions.mjs';
import { runSuite } from '../evals/run.mjs';
import { A, ROOT } from './_paths.mjs';

const FIXTURES = path.join(ROOT, 'evals', 'fixtures');
const HARNESS = path.join(A, 'bin', 'harness');

function dir() {
  const root = mkdtempSync(path.join(tmpdir(), 'campaign-'));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

// B2. A later sprint's requirement must not be reachable before its own step runs. Asserted
// structurally: the text must not appear anywhere in the working copy.
test('unseenRequirements fires when a later prompt is planted in the working copy', () => {
  const d = dir();
  try {
    mkdirSync(path.join(d.root, 'src'), { recursive: true });
    writeFileSync(path.join(d.root, 'src/app.js'), 'export const x = 1;\n');
    const clean = unseenRequirements(d.root, ['partial payments']);
    assert.equal(clean.ok, true, clean.violations.join('; '));
    assert.deepEqual(clean.violations, []);

    writeFileSync(path.join(d.root, 'src/app.js'), '// TODO: support partial payments later\n');
    const planted = unseenRequirements(d.root, ['partial payments']);
    assert.equal(planted.ok, false);
    assert.match(planted.violations.join(';'), /partial payments/);
  } finally { d.cleanup(); }
});

test('unseenRequirements does not fire on requirement text that never leaked, and ignores .git', () => {
  const d = dir();
  try {
    mkdirSync(path.join(d.root, '.git'), { recursive: true });
    writeFileSync(path.join(d.root, '.git/COMMIT_EDITMSG'), 'a paid invoice must never appear as overdue\n');
    writeFileSync(path.join(d.root, 'notes.md'), 'sprint 1 covers customers and invoices.\n');
    const r = unseenRequirements(d.root, ['a paid invoice must never appear as overdue']);
    assert.equal(r.ok, true, 'a match inside .git is not a leak into the working copy');
  } finally { d.cleanup(); }
});

// B4. An edit keeps the earlier proof; a deletion-and-rewrite drops it even though the file is
// still there, still has a name, and still asserts something.
test('modifiedNotReplaced distinguishes an edited test file from a deleted-and-rewritten one', () => {
  const d = dir();
  try {
    const file = 'tests/test_ledger.js';
    mkdirSync(path.join(d.root, 'tests'), { recursive: true });
    writeFileSync(path.join(d.root, file),
      "test('test_outstanding_balance_sums_invoices', () => {});\n" +
      "test('test_partial_payment_reduces_balance', () => {});\n");
    const edited = modifiedNotReplaced(d.root, file, ['test_outstanding_balance_sums_invoices']);
    assert.equal(edited.ok, true, edited.violations.join('; '));

    writeFileSync(path.join(d.root, file), "test('test_totally_different_name', () => {});\n");
    const replaced = modifiedNotReplaced(d.root, file, ['test_outstanding_balance_sums_invoices']);
    assert.equal(replaced.ok, false);
    assert.match(replaced.violations.join(';'), /test_outstanding_balance_sums_invoices/);

    rmSync(path.join(d.root, file));
    const deleted = modifiedNotReplaced(d.root, file, ['test_outstanding_balance_sums_invoices']);
    assert.equal(deleted.ok, false);
    assert.match(deleted.violations.join(';'), /no longer exists/);
  } finally { d.cleanup(); }
});

test('CHECKS registers modified_not_replaced and it reads ctx.work', () => {
  assert.ok(KNOWN.includes('modified_not_replaced'));
  const d = dir();
  try {
    writeFileSync(path.join(d.root, 'kept.txt'), 'the original marker text\n');
    const [r] = evaluate({ work: d.root }, [{ modified_not_replaced: { file: 'kept.txt', markers: ['original marker'] } }]);
    assert.equal(r.pass, true, r.detail);
  } finally { d.cleanup(); }
});

function artifact(root, slug, { specStatus = 'approved', behaviours, planStatus = 'approved', proofRows }) {
  const dir = path.join(root, '.aidlc/artifacts', slug);
  mkdirSync(dir, { recursive: true });
  const specBody = behaviours.map((b) => `### ${b}\n\nGiven, when, then.\n`).join('\n');
  writeFileSync(path.join(dir, 'spec.md'), `---\nstatus: ${specStatus}\n---\n# Spec: ${slug}\n\n## Observable behaviours\n\n${specBody}`);
  const table = proofRows.map(([b, file, id]) => `| ${b} | \`${file}\`::\`${id}\` |`).join('\n');
  writeFileSync(path.join(dir, 'plan.md'), `---\nstatus: ${planStatus}\n---\n# Plan: ${slug}\n\n## Proof\n\n| Behaviour | Test |\n|---|---|\n${table}\n`);
}

// B6. A behaviour without a Proof row naming a test is exactly a spec that has quietly become
// fiction — checkable without a model.
test('behavioursHaveTests fires on an approved spec whose B2 no test names', () => {
  const d = dir();
  try {
    mkdirSync(path.join(d.root, 'tests'), { recursive: true });
    writeFileSync(path.join(d.root, 'tests/test_ledger.js'), "test('test_b1_case', () => {});\n");
    artifact(d.root, 'ledger', {
      behaviours: ['B1', 'B2'],
      proofRows: [['B1', 'tests/test_ledger.js', 'test_b1_case']], // B2 has no row
    });
    const r = behavioursHaveTests(d.root);
    assert.equal(r.ok, false);
    assert.match(r.violations.join(';'), /ledger B2: plan\.md's Proof table names no test/);
  } finally { d.cleanup(); }
});

// Negative case: a test that legitimately moved. The Proof table is the source of truth for
// where evidence lives, not a hardcoded default location, so an updated row does not fire.
test('behavioursHaveTests does not fire on a test that legitimately moved', () => {
  const d = dir();
  try {
    mkdirSync(path.join(d.root, 'tests/moved'), { recursive: true });
    writeFileSync(path.join(d.root, 'tests/moved/test_ledger.js'), "test('test_b1_case', () => {});\n");
    artifact(d.root, 'ledger', {
      behaviours: ['B1'],
      proofRows: [['B1', 'tests/moved/test_ledger.js', 'test_b1_case']],
    });
    const r = behavioursHaveTests(d.root);
    assert.equal(r.ok, true, r.violations.join('; '));
  } finally { d.cleanup(); }
});

// Negative case: a behaviour retired on purpose. Removed from spec.md, so the loop never visits
// it — retiring a behaviour is not the defect this check exists to find.
test('behavioursHaveTests does not fire on a behaviour retired on purpose', () => {
  const d = dir();
  try {
    mkdirSync(path.join(d.root, 'tests'), { recursive: true });
    writeFileSync(path.join(d.root, 'tests/test_ledger.js'), "test('test_b1_case', () => {});\n");
    // B2 was retired: spec.md lists only B1 now, even though the plan's Proof table (written
    // when B2 still existed) is not required to be rewritten just to retire a behaviour.
    artifact(d.root, 'ledger', {
      behaviours: ['B1'],
      proofRows: [['B1', 'tests/test_ledger.js', 'test_b1_case']],
    });
    const r = behavioursHaveTests(d.root);
    assert.equal(r.ok, true, r.violations.join('; '));
  } finally { d.cleanup(); }
});

test('behavioursHaveTests ignores a spec that is not approved, and passes with no artifacts at all', () => {
  const d = dir();
  try {
    assert.equal(behavioursHaveTests(d.root).ok, true, 'no .aidlc/artifacts at all');
    artifact(d.root, 'draft-thing', { specStatus: 'draft', behaviours: ['B1'], proofRows: [] });
    const r = behavioursHaveTests(d.root);
    assert.equal(r.ok, true, 'a draft spec is not yet a promise the code must keep');
  } finally { d.cleanup(); }
});

test('CHECKS registers behaviours_have_tests and it reads ctx.work', () => {
  assert.ok(KNOWN.includes('behaviours_have_tests'));
  const d = dir();
  try {
    const [r] = evaluate({ work: d.root }, [{ behaviours_have_tests: true }]);
    assert.equal(r.pass, true, r.detail);
  } finally { d.cleanup(); }
});

// B1. The runner already loops `t.steps` against one working copy, evaluating each step's
// assertions before the next step's prompt is sent. No task has ever exercised that path.
test('a multi-step task runs each step against the same working copy, in order, gated by each step\'s own assertions', async () => {
  const calls = [];
  const invoke = async ({ cwd, step }) => {
    calls.push({ step, cwd, markerPresent: existsSync(path.join(cwd, 'marker-from-step-0.txt')) });
    if (step === 0) writeFileSync(path.join(cwd, 'marker-from-step-0.txt'), 'left by step 0\n');
    return { transcript: `did step ${step}`, usage: { usd: 0.01 } };
  };
  const out = await runSuite({
    tasks: [{
      id: 'two-step', fixture: 'clean-app', timeoutMs: 1000, budgetUsd: 1,
      steps: [
        { prompt: 'first', assert: [{ file_exists: 'marker-from-step-0.txt' }] },
        { prompt: 'second', assert: [{ workdir_unchanged: false }] },
      ],
    }],
    invoke, fixturesDir: FIXTURES, harnessBin: HARNESS,
  });
  assert.deepEqual(calls.map((c) => c.step), [0, 1], 'both steps ran, in order');
  assert.equal(calls[0].cwd, calls[1].cwd, 'both steps run against the same working copy, not a fresh stage');
  assert.equal(calls[1].markerPresent, true, 'step 1 sees what step 0 left behind');
  assert.equal(out.results[0].verdict, 'pass');
});

test('a step that fails its own assertion stops the campaign — the next prompt is never sent', async () => {
  const calls = [];
  const invoke = async ({ step }) => { calls.push(step); return { transcript: 'nothing useful', usage: { usd: 0.01 } }; };
  const out = await runSuite({
    tasks: [{
      id: 'gated', fixture: 'clean-app', timeoutMs: 1000, budgetUsd: 1,
      steps: [
        { prompt: 'first', assert: [{ transcript_matches: 'this will never match' }] },
        { prompt: 'second', assert: [{ workdir_unchanged: true }] },
      ],
    }],
    invoke, fixturesDir: FIXTURES, harnessBin: HARNESS,
  });
  assert.deepEqual(calls, [0], 'step 1 never ran because step 0 failed its own assertion first');
  assert.equal(out.results[0].verdict, 'fail');
});

// B9. A step that runs out of money stops the campaign, and the task is ungraded rather than
// blamed on the model — the same rule run.mjs already enforces for a single-prompt task.
test('a step that exhausts its USD ceiling stops the campaign, and the task is inconclusive, not fail', async () => {
  const calls = [];
  const invoke = async ({ step, budgetUsd }) => {
    calls.push(step);
    if (step === 1) return { transcript: '', usage: { usd: budgetUsd }, incomplete: { reason: 'budget_exhausted', detail: `Reached maximum budget ($${budgetUsd})`, turns: 3 } };
    return { transcript: 'did step 0', usage: { usd: 0.005 } };
  };
  const out = await runSuite({
    tasks: [{
      id: 'ran-dry', fixture: 'clean-app', timeoutMs: 1000, budgetUsd: 0.01,
      steps: [
        { prompt: 'first', assert: [{ workdir_unchanged: true }] },
        { prompt: 'second', assert: [{ workdir_unchanged: true }] },
      ],
    }],
    invoke, fixturesDir: FIXTURES, harnessBin: HARNESS,
  });
  assert.deepEqual(calls, [0, 1], 'step 0 completed; step 1 is the one that ran dry');
  assert.equal(out.results[0].verdict, 'inconclusive');
  assert.equal(out.results[0].passed, 0, 'inconclusive is not a pass');
  assert.equal(out.results[0].runs[0].incomplete.step, 1, 'the runner records which step exhausted the budget');
  assert.equal(out.summary.fail, 0, 'exhausting budget mid-campaign is not scored a model failure');
  assert.equal(out.summary.inconclusive, 1);
});

test('CHECKS registers unseen_requirements and it reads ctx.work', () => {
  assert.ok(KNOWN.includes('unseen_requirements'));
  const d = dir();
  try {
    writeFileSync(path.join(d.root, 'a.txt'), 'nothing interesting\n');
    const [r] = evaluate({ work: d.root }, [{ unseen_requirements: ['partial payments'] }]);
    assert.equal(r.pass, true);
  } finally { d.cleanup(); }
});
