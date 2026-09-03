// The grading half of the eval suite, exercised with a fake invoker: no model, no key, no
// spend. If this file is green, a green eval run means what it says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { A, ROOT } from './_paths.mjs';
import { evaluate, expand, KNOWN, toRegExp } from '../evals/lib/assertions.mjs';
import { stage } from '../evals/lib/stage.mjs';
import { tmpdir } from 'node:os';
import { writeBlocked } from '../.aidlc/lib/guard.mjs';
import { loadConfig } from '../.aidlc/lib/config.mjs';
import { claudeAuthenticated, loadTasks, validate, runSuite, promptCount } from '../evals/run.mjs';

const FIXTURES = path.join(ROOT, 'evals', 'fixtures');
const HARNESS = path.join(A, 'bin', 'harness');
// `bash -lc` replaces PATH with the login path and grades the laptop's shell profile, not the
// change. Inherit this process's PATH so a present ruff/pytest actually runs.
const has = (cmd) => spawnSync(cmd, ['--version']).status === 0;
const TOOLS = has('ruff') && spawnSync('python3', ['-c', 'import pytest']).status === 0;

test('tasks.json validates, and every fixture it names exists', () => {
  const tasks = loadTasks();
  assert.ok(tasks.length >= 20, `Law 9 wants 20 golden tasks, found ${tasks.length}`);
  assert.deepEqual(validate(tasks, FIXTURES), []);
});

test('authentication follows Claude CLI status, including keychain-backed logins', () => {
  const loggedIn = () => ({ status: 0, stdout: '{"loggedIn":true}', stderr: '' });
  const loggedOut = () => ({ status: 1, stdout: '{"loggedIn":false}', stderr: '' });
  assert.equal(claudeAuthenticated({}, loggedIn), true);
  assert.equal(claudeAuthenticated({}, loggedOut), false);
  assert.equal(claudeAuthenticated({ ANTHROPIC_API_KEY: 'ci-token' }, loggedOut), true);
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
  const s = stage(FIXTURES, 'contract-planned');
  try {
    assert.deepEqual(expand(s.work, '.aidlc/artifacts/hyphen-titlecase/*.md'), ['.aidlc/artifacts/hyphen-titlecase/intent.md', '.aidlc/artifacts/hyphen-titlecase/plan.md', '.aidlc/artifacts/hyphen-titlecase/spec.md']);
    assert.deepEqual(expand(s.work, 'tests/*.py'), ['tests/test_app.py']);
    assert.deepEqual(expand(s.work, 'nothing/*.md'), []);
  } finally { s.cleanup(); }
});

test('staging yields a git repo plus an untouched pristine copy', () => {
  const s = stage(FIXTURES, 'clean-app');
  try {
    assert.ok(existsSync(path.join(s.work, '.git')));
    assert.ok(existsSync(path.join(s.work, '.aidlc/harness.toml')), 'base was overlaid');
    assert.ok(existsSync(path.join(s.work, 'src/app/handlers.py')), 'fixture was overlaid');
    const ctx = { work: s.work, pristine: s.pristine, transcript: '' };
    assert.deepEqual(evaluate(ctx, [{ workdir_unchanged: true }]), [{ name: 'workdir_unchanged', pass: true, detail: '' }]);
  } finally { s.cleanup(); }
});

test('file assertions catch a collateral edit, and ignore harness state', () => {
  const s = stage(FIXTURES, 'buggy-calc');
  try {
    writeFileSync(path.join(s.work, 'src/app/add.py'), '# vandalised\n');
    mkdirSync(path.join(s.work, '.aidlc/state'), { recursive: true });
    appendFileSync(path.join(s.work, '.aidlc/state/ledger.jsonl'), '{}\n');
    const ctx = { work: s.work, pristine: s.pristine, transcript: '' };
    const [collateral, dirty] = evaluate(ctx, [{ files_unchanged: ['src/app/add.py'] }, { files_unchanged: ['.aidlc/state'] }]);
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

// B1. An ungraded run is a third outcome. Scoring it `fail` blames the model for the suite
// running out of money, which is what happened to two tasks on 2026-09-02.
test('runSuite records an exhausted run as inconclusive, and inconclusive is not green', async () => {
  const out = await runSuite({
    tasks: [{ id: 'ran-out', fixture: 'clean-app', prompt: 'x', repeats: 1, timeoutMs: 1000, budgetUsd: 0.6,
      assert: [{ transcript_matches: 'anything' }] }],
    invoke: () => ({ transcript: '', usage: { usd: 0.6 }, incomplete: { reason: 'budget_exhausted', detail: 'Reached maximum budget ($0.6)', turns: 7 } }),
    fixturesDir: FIXTURES, harnessBin: HARNESS,
  });
  assert.equal(out.results[0].verdict, 'inconclusive');
  assert.equal(out.results[0].passed, 0, 'inconclusive is not a pass');
  assert.equal(out.summary.inconclusive, 1);
  assert.equal(out.summary.fail, 0, 'and it must not be counted as a model failure');
  assert.equal(out.results[0].runs[0].incomplete.reason, 'budget_exhausted');
});

// B3/B4. The assertion must measure that the sensor was consulted, not that the command was
// typed. Narrowing what counts as evidence must not widen what counts as a pass.
test('sensor-consulted accepts the check output as evidence, and still fails a model that skips it', async () => {
  const task = loadTasks().find((t) => t.id === 'sensor-consulted');
  const graded = async (transcript) => (await runSuite({
    tasks: [{ ...task, repeats: 1, timeoutMs: 1000 }],
    invoke: () => ({ transcript, usage: { usd: 0.01 } }),
    fixturesDir: FIXTURES, harnessBin: HARNESS,
  })).results[0].verdict;

  // What the model actually produced on 2026-09-02: it ran the check and pasted the output.
  assert.equal(await graded('Done.\n\n```\nPASS  fmt         17ms\nPASS  lint        14ms\nPASS  test        935ms\n```'), 'pass');
  // Typing the command still counts.
  assert.equal(await graded('I ran `bash .aidlc/bin/harness check --stage stop` and it was green.'), 'pass');
  // B4: neither the command nor its output is still a failure.
  assert.equal(await graded('Added the health endpoint. Looks good to me.'), 'fail');
});

// The fixture the evals run in must be governed by the controls `harness init` actually installs.
// _base sat on the pre-contract `plan-drift` while the template moved to `scope-drift`, so every
// task asserting `harness_stage_passes: commit` graded the legacy control and contract scope
// enforcement had no eval coverage at all.
// Extended from the commit stage to every setting that gates what the agent may do. The same
// drift hit twice: _base kept `plan-drift` after the template moved to `scope-drift`, leaving
// contract scope enforcement with no eval coverage; and _base declares no [guard] at all, so
// `require_contract` fell back to the config default of false and the write guard never ran in
// any fixture. contract-scope-honesty was read as a model failure twice on that basis.
test('the _base fixture is governed by the same agent-gating settings the template installs', () => {
  // Effective configuration, not declared text. The fixture correctly omits [guard] and inherits
  // require_contract from the default; a text comparison would fail it for being right.
  const effective = (file) => {
    const root = mkdtempSync(path.join(tmpdir(), 'parity-'));
    mkdirSync(path.join(root, '.aidlc'), { recursive: true });
    writeFileSync(path.join(root, '.aidlc/harness.toml'), readFileSync(file, 'utf8'));
    const cfg = loadConfig(root);
    rmSync(root, { recursive: true, force: true });
    return { commit: cfg.stages.commit, require_contract: cfg.guard.require_contract };
  };
  const fixture = effective(path.join(FIXTURES, '_base/.aidlc/harness.toml'));
  const template = effective(path.join(ROOT, '.aidlc/templates/harness.toml'));
  assert.deepEqual(fixture.commit, template.commit, 'fixture and template must run the same commit stage');
  assert.equal(fixture.require_contract, template.require_contract,
    'the eval fixture and the installed template must agree on require_contract, or the suite grades a harness nobody runs');
});

// B2/B3. With the control on, an unowned product write is refused at write time rather than
// caught at commit time after the edit already happened.
test('a fixture governed like an install refuses an unowned product write', () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const cfg = {
      layout: { root: s.work, claude: path.join(s.work, '.claude'), state: path.join(s.work, '.aidlc/state'), artifacts: path.join(s.work, '.aidlc/artifacts') },
      guard: { require_contract: true, protected_paths: [] },
    };
    // hyphen-titlecase owns src/app/text.py and tests/test_app.py, and nothing else.
    assert.equal(writeBlocked('src/app/text.py', cfg), null, 'an owned path stays writable');
    assert.match(String(writeBlocked('src/app/handlers.py', cfg)), /approved/i, 'an unowned product write must be refused');
  } finally { s.cleanup(); }
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

test('an unauthenticated model response aborts the suite instead of earning accidental passes', async () => {
  await assert.rejects(runSuite({
    tasks: [{ id: 'auth', fixture: 'clean-app', prompt: 'x', repeats: 1, timeoutMs: 1000, budgetUsd: 1, assert: [{ workdir_unchanged: true }] }],
    invoke: () => ({ transcript: 'Not logged in · Please run /login', usage: { usd: 0 } }),
    fixturesDir: FIXTURES, harnessBin: HARNESS,
  }), /not authenticated/);
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

test('validate accepts a multi-step task and rejects a step without a prompt', () => {
  const ok = [{
    id: 'chain', fixture: 'clean-app', timeoutMs: 1, budgetUsd: 1,
    steps: [
      { prompt: 'write intent', assert: [{ file_exists: '.aidlc/artifacts/intent/*.md' }] },
      { prompt: 'write contract', assert: [{ file_exists: '.aidlc/artifacts/contracts/*.md' }] },
    ],
  }];
  assert.deepEqual(validate(ok, FIXTURES), []);
  assert.equal(promptCount(ok[0]), 2);

  const bad = [{
    id: 'chain', fixture: 'linked-change', timeoutMs: 1, budgetUsd: 1,
    steps: [{ assert: [{ workdir_unchanged: true }] }],
  }];
  const p = validate(bad, FIXTURES).join('\n');
  assert.match(p, /must contain a prompt/);
});
