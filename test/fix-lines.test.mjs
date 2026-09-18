// G15. Every finding says what to do about it, and every justified suppression reaches the
// person deciding the merge.
//
// A finding with no `fix` line is a finding the reader has to research before they can act, which
// is how a control that fires accurately still gets ignored. The rule the sensors article states:
// one sentence, written for the model, naming the judgment to make — and saying that a
// suppression with a `why:` is a legitimate answer when the rule is wrong here.
//
// The other half is the `why:` itself. `tamper` already let a suppression through when it carried
// one; letting it through silently means nobody ever reads the reason. They are collected and
// listed on the pull request, where the person who can disagree with one is looking.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { normalize, KNOWN_FORMATS } from '../.claude/harness/lib/normalize.mjs';
import { render } from '../.claude/harness/lib/runner.mjs';
import { run as tamper } from '../.claude/harness/checks/tamper.mjs';
import { suppressionsOf } from '../.claude/harness/lib/deliver.mjs';
import { loadConfig } from '../.claude/harness/lib/config.mjs';
import { FIXTURES, stage } from '../evals/lib/stage.mjs';

// One representative failure per format, in the shape the tool actually emits.
const SAMPLES = {
  ruff: [JSON.stringify([{ filename: 'a.py', location: { row: 3 }, code: 'E501', message: 'line too long' }]), 1],
  eslint: [JSON.stringify([{ filePath: 'a.js', messages: [{ line: 2, ruleId: 'complexity', message: 'too complex' }] }]), 1],
  mypy: [JSON.stringify({ file: 'a.py', line: 1, code: 'arg-type', message: 'bad argument' }), 1],
  tsc: ['a.ts(4,9): error TS2345: bad argument', 1],
  pytest: [JSON.stringify({ tests: [{ nodeid: 'tests/t.py::test_x', outcome: 'failed', lineno: 7 }] }), 1],
  tap: ['TAP version 13\nnot ok 1 - it works\n  ---\n  location: \'test/a.test.mjs:4\'\n  ...\n', 1],
  mutation: [JSON.stringify({ files: { 'a.ts': { mutants: [{ status: 'Survived', mutatorName: 'Block', location: { start: { line: 2 } } }] } } }), 0],
  semgrep: [JSON.stringify({ results: [{ check_id: 'r', path: 'a.ts', start: { line: 1 }, extra: { message: 'unsafe' } }] }), 1],
  depcruise: [JSON.stringify({ summary: { violations: [{ from: 'a.ts', to: 'b.ts', rule: { name: 'no-b' } }] } }), 0],
  'import-linter': ['Layers BROKEN\n- app.a -> app.b\n', 1],
  generic: ['something went wrong', 1],
};

test('every format produces findings that say what to do about them', () => {
  for (const format of KNOWN_FORMATS) {
    const sample = SAMPLES[format];
    assert.ok(sample, `${format} has no sample here — a new format must arrive with one`);
    const findings = normalize(format, sample[0], '', sample[1]);
    assert.ok(findings.length, `${format} produced no finding from a failing sample`);
    for (const f of findings) {
      assert.ok(f.fix?.trim(), `${format} produced a finding with no fix line`);
      // A sentence for the model, not a label. "fix it" and "error" are not instructions.
      assert.ok(f.fix.split(' ').length >= 6, `${format}'s fix line is a label, not a sentence: ${f.fix}`);
      assert.ok(f.rule?.trim(), `${format} produced a finding with no rule`);
    }
  }
});

test('a fix line names the judgment to make, and says a reasoned suppression is an answer', () => {
  // The generic one, which is what a rule with no tool-specific advice falls back to.
  const ruff = normalize('ruff', ...SAMPLES.ruff.slice(0, 1), '', 1);
  assert.match(ruff[0].fix, /suppress it with a `why:`/);
  // A tool that knows the fix says the tool's own thing instead of the generic sentence.
  const autofixable = normalize('ruff', JSON.stringify([{ filename: 'a.py', location: { row: 3 }, code: 'E501',
    message: 'line too long', fix: { message: 'wrap the line' } }]), '', 1);
  assert.match(autofixable[0].fix, /wrap the line/);
  assert.match(autofixable[0].fix, /--fix/);
  // And an unreadable report says what makes it unreadable, not "fix the error".
  const unparseable = normalize('ruff', 'not json at all', '', 0);
  assert.equal(unparseable[0].rule, 'harness/unparseable-output');
  assert.match(unparseable[0].fix, /\[formats\] entry/);
  assert.match(unparseable[0].fix, /exit code cannot establish/);
});

test('the rendered report shows the fix line for every finding', () => {
  const report = {
    ok: false, identity_errors: [], controls: [
      { control: 'lint', verdict: 'fail', ms: 4, truncated: 0, findings: normalize('ruff', ...SAMPLES.ruff.slice(0, 1), '', 1) },
      { control: 'test', verdict: 'fail', ms: 9, truncated: 0, findings: normalize('tap', ...SAMPLES.tap.slice(0, 1), '', 1) },
    ],
  };
  const text = render(report, null);
  for (const control of report.controls) {
    for (const f of control.findings) {
      assert.ok(text.includes(`-> ${f.fix}`), `${control.control}'s fix line is missing from the rendered report`);
    }
  }
  assert.match(text, /a\.py:3 {2}E501/);
});

// Left uncommitted on purpose: `tamper` reads the working tree against HEAD, which is the diff a
// commit-stage check is about to let through.
function repoWith(line) {
  const s = stage(FIXTURES, 'contract-planned');
  const target = path.join(s.work, 'src/app/text.py');
  writeFileSync(target, `${readFileSync(target, 'utf8')}${line}\n`);
  return s;
}

test('a suppression with a reason is recorded rather than refused, and one without is refused', async () => {
  const justified = repoWith('BAD = 1  # noqa: E501  # why: the generated column name is longer than the limit');
  try {
    const cfg = loadConfig(justified.work);
    const result = await tamper(cfg, [], []);
    assert.equal(result.verdict, 'pass', JSON.stringify(result.findings));
    assert.equal(result.suppressions.length, 1, JSON.stringify(result.suppressions));
    assert.equal(result.suppressions[0].file, 'src/app/text.py');
    assert.match(result.suppressions[0].rule, /noqa/i);
    assert.match(result.suppressions[0].why, /generated column name/);
    assert.ok(result.suppressions[0].line > 0);
  } finally { justified.cleanup(); }

  const bare = repoWith('BAD = 1  # noqa: E501');
  try {
    const result = await tamper(loadConfig(bare.work), [], []);
    assert.equal(result.verdict, 'fail');
    assert.equal(result.findings[0].rule, 'bare-suppression');
    assert.deepEqual(result.suppressions, [], 'an unexplained suppression is a finding, not a record');
    assert.match(result.findings[0].fix, /why:/);
  } finally { bare.cleanup(); }
});

test('the driver lists the suppressions the commit-stage checks saw on the pull request', async () => {
  const { deliver } = await import('../.claude/harness/lib/deliver.mjs');
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const cfg = loadConfig(s.work);
    const suppression = { file: 'src/app/text.py', line: 12, rule: '# noqa', why: 'the generated column name is longer than the limit' };
    let body = null;
    await deliver(cfg, 'hyphen-titlecase', {
      live: true,
      async invoke() { return { ok: true, usd: 0.01, sessionId: 's', transcript: '' }; },
      // The commit stage is where `tamper` runs, and it is the report the PR phase reads.
      async check(stageName) {
        return { stage: stageName, ok: true,
          controls: stageName === 'commit' ? [{ control: 'tamper', verdict: 'pass', suppressions: [suppression] }] : [] };
      },
      async review(options) {
        writeFileSync(path.resolve(s.work, options.output), '# Independent review\n\napprove\n');
        return { status: 'complete', output: options.output, usd: 0, export: { scope: 'plan', files: 4 } };
      },
      async openPr(pr) { body = pr.body; return { url: 'https://example.invalid/pull/1' }; },
    });

    assert.ok(body, 'no pull request was opened');
    assert.match(body, /## Suppressions/);
    assert.match(body, /`src\/app\/text\.py` \| 12 \| `# noqa` \| the generated column name/);
    assert.match(body, /disagree with one here rather than/);
  } finally { s.cleanup(); }

  // No suppressions, no section: an empty heading is noise on every pull request that has none.
  assert.deepEqual(suppressionsOf({ controls: [{ control: 'tamper', verdict: 'pass' }] }), []);
  assert.deepEqual(suppressionsOf(null), []);
});
