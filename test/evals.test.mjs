// The grading half of the eval suite, exercised with a fake invoker: no model, no key, no
// spend. If this file is green, a green eval run means what it says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { C, ROOT } from './_paths.mjs';
import { evaluate, expand, KNOWN, toRegExp } from '../evals/lib/assertions.mjs';
import { stage } from '../evals/lib/stage.mjs';
import { loadTasks, validate, runSuite, promptCount } from '../evals/run.mjs';
import { approveDrafts } from '../evals/lib/approve.mjs';

const FIXTURES = path.join(ROOT, 'evals', 'fixtures');
const HARNESS = path.join(C, 'bin', 'harness');
// `bash -lc` replaces PATH with the login path and grades the laptop's shell profile, not the
// change. Inherit this process's PATH so a present ruff/pytest actually runs.
const has = (cmd) => spawnSync(cmd, ['--version']).status === 0;
const TOOLS = has('ruff') && spawnSync('python3', ['-c', 'import pytest']).status === 0;

test('tasks.json validates, and every fixture it names exists', () => {
  const tasks = loadTasks();
  assert.ok(tasks.length >= 20, `Law 9 wants 20 golden tasks, found ${tasks.length}`);
  assert.deepEqual(validate(tasks, FIXTURES), []);
});

test('validate rejects the four ways a task wastes money', () => {
  const bad = [
    { id: 'a', prompt: 'x', fixture: 'clean-app', timeoutMs: 1, assert: [{ workdir_unchanged: true }] },      // no budget
    { id: 'a', prompt: 'x', fixture: 'clean-app', timeoutMs: 1, budgetUsd: 1, assert: [{ nope: true }] },      // duplicate id + unknown assertion
    { id: 'c', prompt: 'x', fixture: 'ghost', timeoutMs: 1, budgetUsd: 1, assert: [{ workdir_unchanged: true }] },
    { id: 'd', prompt: 'x', fixture: 'clean-app', timeoutMs: 1, budgetUsd: 1, assert: [] },
  ];
  const p = validate(bad, FIXTURES).join('\n');
  assert.match(p, /no USD ceiling/);
  assert.match(p, /duplicate id/);
  assert.match(p, /unknown assertion "nope"/);
  assert.match(p, /no fixture "ghost"/);
  assert.match(p, /no assertions/);
});

test('glob expands one segment at a time', () => {
  const s = stage(FIXTURES, 'planned-change');
  try {
    assert.deepEqual(expand(s.work, '.claude/artifacts/plan/*.md'), ['.claude/artifacts/plan/hyphen-titlecase.md']);
    assert.deepEqual(expand(s.work, 'tests/*.py'), ['tests/test_app.py']);
    assert.deepEqual(expand(s.work, 'nothing/*.md'), []);
  } finally { s.cleanup(); }
});

test('staging yields a git repo plus an untouched pristine copy', () => {
  const s = stage(FIXTURES, 'clean-app');
  try {
    assert.ok(existsSync(path.join(s.work, '.git')));
    assert.ok(existsSync(path.join(s.work, '.claude/harness.toml')), 'base was overlaid');
    assert.ok(existsSync(path.join(s.work, 'src/app/handlers.py')), 'fixture was overlaid');
    const ctx = { work: s.work, pristine: s.pristine, transcript: '' };
    assert.deepEqual(evaluate(ctx, [{ workdir_unchanged: true }]), [{ name: 'workdir_unchanged', pass: true, detail: '' }]);
  } finally { s.cleanup(); }
});

test('file assertions catch a collateral edit, and ignore harness state', () => {
  const s = stage(FIXTURES, 'buggy-calc');
  try {
    writeFileSync(path.join(s.work, 'src/app/add.py'), '# vandalised\n');
    mkdirSync(path.join(s.work, '.claude/state'), { recursive: true });
    appendFileSync(path.join(s.work, '.claude/state/ledger.jsonl'), '{}\n');
    const ctx = { work: s.work, pristine: s.pristine, transcript: '' };
    const [collateral, dirty] = evaluate(ctx, [{ files_unchanged: ['src/app/add.py'] }, { files_unchanged: ['.claude/state'] }]);
    assert.equal(collateral.pass, false);
    assert.match(collateral.detail, /src\/app\/add\.py/);
    assert.equal(dirty.pass, true, 'ledger writes are not a collateral edit');
  } finally { s.cleanup(); }
});

test('transcript assertions: match, not-match, and order', () => {
  const ctx = { transcript: 'wrote the test\nit failed as expected\nnow it passes' };
  const r = evaluate(ctx, [
    { transcript_matches: 'failed' },
    { transcript_not_matches: '(?i)all tests pass' },
    { transcript_order: ['test', 'fail', 'pass'] },
    { transcript_order: ['pass', 'fail'] },
  ]);
  assert.deepEqual(r.map((x) => x.pass), [true, true, true, false]);
});

test('an unknown assertion fails loudly rather than passing silently', () => {
  const [r] = evaluate({ transcript: '' }, [{ definitely_not_a_check: true }]);
  assert.equal(r.pass, false);
  assert.match(r.detail, /unknown assertion/);
  assert.ok(!KNOWN.includes('definitely_not_a_check'));
});

test('under_baseline records rather than grades when no baseline exists yet', () => {
  const none = evaluate({ usage: { output_tokens: 9999 } }, [{ under_baseline: { metric: 'output_tokens', tolerance: 1.25 } }]);
  assert.equal(none[0].pass, true);
  const over = evaluate({ usage: { output_tokens: 9999 }, baseline: { output_tokens: 1000 } }, [{ under_baseline: { metric: 'output_tokens', tolerance: 1.25 } }]);
  assert.equal(over[0].pass, false);
});

test('runSuite grades a fake invoker, and 2-of-3 is flaky, not green', async () => {
  let call = 0;
  const invoke = ({ cwd }) => {
    call++;
    // Every other attempt makes a collateral edit — exactly the drift repeats exist to catch.
    if (call % 2 === 0) writeFileSync(path.join(cwd, 'src/app/add.py'), '# collateral\n');
    return { transcript: 'done', usage: { usd: 0.01 } };
  };
  const out = await runSuite({
    tasks: [{ id: 'flaky-demo', fixture: 'buggy-calc', prompt: 'x', repeats: 3, timeoutMs: 1000, budgetUsd: 1,
      assert: [{ files_unchanged: ['src/app/add.py'] }] }],
    invoke, fixturesDir: FIXTURES, harnessBin: HARNESS,
  });
  assert.equal(out.results[0].verdict, 'flaky');
  assert.equal(out.results[0].passed, 2);
  assert.equal(out.summary.flaky, 1);
  assert.equal(out.summary.usd, 0.03);
});

test('an invoker that throws is a failed task, not a crashed suite', async () => {
  const out = await runSuite({
    tasks: [{ id: 'boom', fixture: 'clean-app', prompt: 'x', repeats: 1, timeoutMs: 1000, budgetUsd: 1, assert: [{ workdir_unchanged: true }] }],
    invoke: () => { throw new Error('model unreachable'); },
    fixturesDir: FIXTURES, harnessBin: HARNESS,
  });
  assert.equal(out.results[0].verdict, 'fail');
  assert.match(out.results[0].runs[0].assertions[0].detail, /model unreachable/);
});

// A fixture that is not actually broken silently passes every task written against it.
test('fixtures are what they claim: clean-app green, buggy-calc and broken-suite red', { skip: TOOLS ? false : 'ruff/pytest not installed' }, () => {
  for (const [name, shouldPass] of [['clean-app', true], ['buggy-calc', false], ['broken-suite', false]]) {
    const s = stage(FIXTURES, name);
    try {
      const [r] = evaluate({ work: s.work, pristine: s.pristine, transcript: '', harness: HARNESS }, [{ fixture_tests_pass: shouldPass }]);
      assert.equal(r.pass, true, `${name}: expected tests to ${shouldPass ? 'pass' : 'fail'} — ${r.detail}`);
    } finally { s.cleanup(); }
  }
});

test('at-skill-limit sits exactly at the Law 5 ceiling', async () => {
  const skills = readFileSync(path.join(ROOT, 'evals', 'tasks.json'), 'utf8');
  assert.match(skills, /budget-forces-deletion/);
  const dir = path.join(FIXTURES, 'at-skill-limit', '.claude', 'skills');
  const { readdirSync } = await import('node:fs');
  assert.equal(readdirSync(dir).length, 12);
});

test('inline (?i) is translated, because JavaScript is the odd dialect out', () => {
  assert.equal(toRegExp('(?i)ALL TESTS PASS').test('all tests pass'), true);
  assert.equal(toRegExp('ALL TESTS PASS').test('all tests pass'), false);
  // And a genuinely broken pattern is caught statically, not at $0.75 a run.
  const bad = [{ id: 'x', prompt: 'p', fixture: 'clean-app', timeoutMs: 1, budgetUsd: 1,
    assert: [{ transcript_matches: '(unclosed' }] }];
  assert.match(validate(bad, FIXTURES).join('\n'), /bad regex/);
});

test('validate accepts a multi-step task and rejects a step that is neither prompt nor approve', () => {
  const ok = [{
    id: 'chain', fixture: 'linked-change', timeoutMs: 1, budgetUsd: 1,
    steps: [
      { prompt: 'write intent', assert: [{ file_exists: '.claude/artifacts/intent/*.md' }] },
      { approve: 'intent' },
    ],
  }];
  assert.deepEqual(validate(ok, FIXTURES), []);
  assert.equal(promptCount(ok[0]), 1);

  const bad = [{
    id: 'chain', fixture: 'linked-change', timeoutMs: 1, budgetUsd: 1,
    steps: [{ assert: [{ workdir_unchanged: true }] }],
  }];
  const p = validate(bad, FIXTURES).join('\n');
  assert.match(p, /must be prompt or approve/);
});

test('approveDrafts commits a new draft and leaves fixture artifacts alone', () => {
  const s = stage(FIXTURES, 'linked-change');
  try {
    const dir = path.join(s.work, '.claude/artifacts/intent');
    writeFileSync(path.join(dir, 'family-sort-key.md'), '# Intent\n\n- **Status:** draft\n');
    const hit = approveDrafts(s.work, s.pristine, 'intent');
    assert.equal(hit.ok, true, hit.detail);
    assert.match(readFileSync(path.join(dir, 'family-sort-key.md'), 'utf8'), /\*\*Status:\*\* approved/);
    assert.match(readFileSync(path.join(dir, 'hyphen-titlecase.md'), 'utf8'), /\*\*Status:\*\* approved/);
    const miss = approveDrafts(s.work, s.pristine, 'spec');
    assert.equal(miss.ok, false);
    assert.match(miss.detail, /no new spec/);
  } finally { s.cleanup(); }
});

test('a multi-step task keeps the workdir, so a later step sees the committed approval', async () => {
  const invoke = ({ prompt, cwd }) => {
    const intentDir = path.join(cwd, '.claude/artifacts/intent');
    const specDir = path.join(cwd, '.claude/artifacts/spec');
    if (prompt.includes('write intent')) {
      mkdirSync(intentDir, { recursive: true });
      writeFileSync(path.join(intentDir, 'family-sort-key.md'), [
        '# Intent: family-sort-key',
        '- **Status:** draft',
        '',
        'Invoice search cannot sort by family name.',
      ].join('\n'));
      return { transcript: 'wrote intent', usage: { usd: 0.01 } };
    }
    const intent = readFileSync(path.join(intentDir, 'family-sort-key.md'), 'utf8');
    assert.match(intent, /\*\*Status:\*\* approved/, 'spec step must see the approved intent');
    mkdirSync(specDir, { recursive: true });
    writeFileSync(path.join(specDir, 'family-sort-key.md'), [
      '# Spec: family-sort-key',
      '- **Status:** draft',
      '',
      'Continues hyphen-titlecase.',
      '## Out of scope',
    ].join('\n'));
    return { transcript: 'wrote spec', usage: { usd: 0.02 } };
  };
  const out = await runSuite({
    tasks: [{
      id: 'second-req', fixture: 'linked-change', prompt: undefined, repeats: 1, timeoutMs: 1000, budgetUsd: 1,
      steps: [
        { prompt: 'write intent from docs/req-b.md', assert: [{ file_exists: '.claude/artifacts/intent/family-sort-key.md' }] },
        { approve: 'intent' },
        { prompt: 'write spec from the approved intent', assert: [{ file_matches: ['.claude/artifacts/spec/family-sort-key.md', 'hyphen-titlecase'] }] },
      ],
    }],
    invoke, fixturesDir: FIXTURES, harnessBin: HARNESS,
  });
  assert.equal(out.results[0].verdict, 'pass', JSON.stringify(out.results[0].runs[0].assertions));
  assert.equal(out.summary.usd, 0.03);
});

test('fixtures are what they claim: linked-change is green with req A already shipped', { skip: TOOLS ? false : 'ruff/pytest not installed' }, () => {
  const s = stage(FIXTURES, 'linked-change');
  try {
    const [r] = evaluate({ work: s.work, pristine: s.pristine, transcript: '', harness: HARNESS }, [{ fixture_tests_pass: true }]);
    assert.equal(r.pass, true, `linked-change: expected tests to pass — ${r.detail}`);
    assert.ok(existsSync(path.join(s.work, 'docs/req-b.md')));
    assert.match(readFileSync(path.join(s.work, '.claude/artifacts/plan/hyphen-titlecase.md'), 'utf8'), /Status:\*\* approved/);
  } finally { s.cleanup(); }
});
