// G21. The golden tasks, emitted in the layout `claude plugin eval` reads, from the one source
// that already holds them.
//
// Two layouts over one task list is the point: two independent gradings of the same behaviour
// disagreeing is a finding. What this file protects is that the second layout stays honest —
// generated rather than hand-written, never asserting less than the task asked for while claiming
// to be the same task, and explicit about which assertions it cannot express at all.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { caseFor, generate, write, onDisk, expected, canonical, RUNNER_ONLY } from '../evals/generate-cases.mjs';
import { contribution } from '../evals/contribution.mjs';
import { loadTasks } from '../evals/run.mjs';
import { ROOT } from './_paths.mjs';

test('an assertion becomes the grader that expresses it, or it stays with run.mjs', () => {
  const emitted = caseFor({
    id: 'sample-task', prompt: 'Do the thing.',
    assert: [{ transcript_matches: 'because' }, { file_exists: '.aidlc/artifacts/*/intent.md' },
      { transcript_order: ['Glob', 'Read'] }, { fixture_tests_pass: true }],
  });
  assert.equal(emitted.dir, 'sample-task');
  assert.deepEqual(emitted.graders.map((g) => g.name), ['transcript-matches-1', 'file-exists-2', 'transcript-order-3']);
  const grader = (name) => emitted.graders.find((g) => g.name === name).text;
  assert.match(grader('transcript-matches-1'), /^type: regex$/m);
  assert.match(grader('transcript-matches-1'), /^pattern: "because"$/m);
  assert.match(grader('file-exists-2'), /^type: file_exists$/m);
  assert.match(grader('transcript-order-3'), /^before: "Glob"$/m);
  assert.match(grader('transcript-order-3'), /^after: "Read"$/m);
  // The one it cannot express is named, not dropped in silence.
  assert.deepEqual(emitted.unsupported, ['fixture_tests_pass']);

  // A grader needs the tools it grades. The CLI warns when a `file_exists` grader cannot pass with
  // the granted tools, and it is right to: such a case would fail for a reason that is not the
  // behaviour under test.
  assert.match(emitted.prompt, /allowed_tools: \[Read, Glob, Grep, Skill, Write, Edit\]/);
  const readOnly = caseFor({ id: 'x', prompt: 'p', assert: [{ transcript_matches: 'a' }] });
  assert.match(readOnly.prompt, /allowed_tools: \[Read, Glob, Grep, Skill\]/);
});

test('a task no free grader can express produces no case at all', () => {
  // A case with no grader always scores 1: it asserts nothing, and a grader-less pass is worse
  // than no case, because it looks like evidence.
  const skipped = caseFor({ id: 'runner-only', prompt: 'p', assert: [{ fixture_tests_pass: true }, { files_unchanged: ['a'] }] });
  assert.equal(skipped.skipped, true);
  assert.deepEqual(skipped.unsupported, ['fixture_tests_pass', 'files_unchanged']);

  // `transcript_not_matches` is on that list for a reason the CLI gave us: the free regex grader
  // has no negation, and paying an llm grader to answer what a substring search answers is not a
  // trade worth making.
  assert.ok(RUNNER_ONLY.includes('transcript_not_matches'));
  assert.equal(caseFor({ id: 'n', prompt: 'p', assert: [{ transcript_not_matches: 'redis' }] }).skipped, true);
});

test('every generated case carries at least one grader and the whole prompt it came from', () => {
  const tasks = loadTasks();
  const cases = generate(tasks);
  const emitted = cases.filter((c) => !c.skipped);
  assert.ok(emitted.length >= 10, `${emitted.length} cases from ${tasks.length} tasks`);

  for (const c of emitted) {
    assert.ok(c.graders.length, `${c.id} has no grader`);
    const task = tasks.find((t) => t.id === c.id);
    // The prompt is the task's prompt, not a paraphrase: a case that asks something else is a
    // different measurement wearing the same name.
    assert.ok(c.prompt.includes(task.prompt.trim()), `${c.id}'s prompt is not the task's prompt`);
    assert.match(c.prompt, /^max_turns: \d+$/m);
    assert.match(c.prompt, /Do not edit by hand/);
    for (const g of c.graders) assert.match(g.text, /^weight: \d+$/m);
  }
});

test('what is on disk is what the generator produces', () => {
  // Two places stating one task is two tasks that drift. `--check` is what CI runs, and it is
  // asserted here against the committed tree rather than against a temp copy.
  assert.equal(canonical(onDisk()), canonical(expected(generate(loadTasks()))),
    'evals/cases/ is stale or hand-edited — run: node evals/generate-cases.mjs');
  // Compared canonically because `onDisk` reads in directory order and `expected` builds in task
  // order: a stringify of the same entries in a different order is a different string, which
  // reported drift on a tree that was byte-identical. It must still catch a real edit.
  const tampered = expected(generate(loadTasks()));
  tampered[Object.keys(tampered)[0]].prompt = 'something a human typed here';
  assert.notEqual(canonical(onDisk()), canonical(tampered));

  const check = spawnSync(process.execPath, [path.join(ROOT, 'evals/generate-cases.mjs'), '--check'],
    { cwd: ROOT, encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /matches evals\/tasks\.json/);

  // `claude plugin eval` writes `results/` beside the cases it ran. That is its output, not a
  // case, and comparing it against the generator would report drift every time the suite scored.
  const results = path.join(ROOT, 'evals/cases/results');
  mkdirSync(results, { recursive: true });
  try {
    assert.equal(canonical(onDisk()), canonical(expected(generate(loadTasks()))), 'the CLI\'s own results directory was read as a case');
  } finally { rmSync(results, { recursive: true, force: true }); }
});

test('a fixture secret in a task prompt is marked on its own line, not suppressed wholesale', () => {
  // `no-secret-commit` seeds a fake key on purpose — it is the task about not committing one —
  // and copying that prompt into a committed file makes the secrets check fire, correctly. The
  // one line carrying it is marked; marking the file, or the generator's whole output, would
  // suppress a control over every prompt this ever writes.
  const prompt = readFileSync(path.join(ROOT, 'evals/cases/no-secret-commit/prompt.md'), 'utf8');
  const marked = prompt.split('\n').filter((l) => l.includes('harness:allow-secret'));
  assert.equal(marked.length, 1, 'exactly the line with the fixture key is marked');
  assert.match(marked[0], /sk-ant-/);
  assert.match(marked[0], /a fixture key in a golden task's prompt/);

  for (const dir of readdirSync(path.join(ROOT, 'evals/cases'), { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name === 'no-secret-commit') continue;
    const other = path.join(ROOT, 'evals/cases', dir.name, 'prompt.md');
    if (!existsSync(other)) continue;
    assert.doesNotMatch(readFileSync(other, 'utf8'), /harness:allow-secret/, `${dir.name} is suppressing a control it does not need to`);
  }
});

test('the generator rewrites its output rather than accumulating it', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cases-'));
  try {
    write(generate([{ id: 'first', prompt: 'p', assert: [{ transcript_matches: 'a' }] }]), dir);
    assert.ok(existsSync(path.join(dir, 'first/prompt.md')));
    // A case whose task was deleted must not survive as a case nobody can trace to a task.
    write(generate([{ id: 'second', prompt: 'p', assert: [{ transcript_matches: 'b' }] }]), dir);
    assert.equal(existsSync(path.join(dir, 'first')), false, 'a stale case survived a regeneration');
    assert.ok(existsSync(path.join(dir, 'second/prompt.md')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the contribution record measures the two arms and never invents the missing one', () => {
  const record = contribution({ cases: [
    { id: 'a', arms: { with: { score: 1 }, without: { score: 0.5 } } },
    { id: 'b', arms: { with: { score: 0.5 }, without: { score: 0.5 } } },
    { id: 'c', arms: { with: { score: 0 }, without: { score: 1 } } },
    { id: 'd', arms: { with: { score: 1 } } },
  ] });
  assert.equal(record.aggregates.cases, 4);
  assert.equal(record.aggregates.measured, 3);
  assert.equal(record.aggregates.unmeasured, 1);
  assert.equal(record.aggregates.improved, 1);
  assert.equal(record.aggregates.unchanged, 1);
  assert.equal(record.aggregates.regressed, 1);
  // (0.5 + 0 + -1) / 3
  assert.equal(record.aggregates.meanDelta, -0.1667);
  // A case that could not be scored is null, never zero: a missing measurement averaged in as
  // zero is a claim nobody made.
  assert.equal(record.cases.find((c) => c.id === 'd').delta, null);

  const nothing = contribution({ cases: [] });
  assert.equal(nothing.aggregates.meanDelta, null, 'an average of no numbers is not a number');
  assert.equal(contribution({}).aggregates.cases, 0, 'another tool\'s output that moved must read as unmeasured');
});

test('CI runs both layouts, bounded, and records what the harness contributed', () => {
  const workflow = readFileSync(path.join(ROOT, '.github/workflows/harness.yml'), 'utf8');
  assert.match(workflow, /generate-cases\.mjs --check/, 'a stale generated suite must fail before it is scored');
  assert.match(workflow, /claude plugin eval \. --trust-plugin --eval-dir evals\/cases/);
  assert.match(workflow, /--ablation with-without/, 'without both arms there is no contribution to record');
  assert.match(workflow, /--threshold 0\.8/);
  assert.match(workflow, /--max-cost-usd \d+/, 'an unbounded live suite is one nobody bounded');
  assert.match(workflow, /--allow-tools Write Edit/, 'a file_exists grader cannot pass without the operator grant');
  assert.match(workflow, /node evals\/contribution\.mjs/);
  assert.match(workflow, /evals\/evidence\//, 'the evidence has to leave the runner or it was not recorded');
});
