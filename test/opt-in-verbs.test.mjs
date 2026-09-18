// G14. Mutation, SAST and layering: three verbs the harness knows how to read and refuses to run
// for you.
//
// Each is slower or noisier than a commit-stage control should be until a project has decided it
// is worth the wait, so none is in a default stage and all three ship empty. What the harness
// supplies is the part a project cannot: one finding schema, so a surviving mutant, a semgrep hit
// and a broken layer rule reach the model in the same shape as a lint error.
//
// The two fixtures here are real tool output, captured from `examples/scratch-ts`: a Stryker run
// over its sources, and a dependency-cruiser run with a layer violation planted in `src/slug.ts`.
// Stored rather than run, because a test that needs `npm ci` is a test a cold clone cannot run —
// the examples run the tools themselves, and CI runs the examples.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { normalize, KNOWN_FORMATS } from '../.aidlc/lib/normalize.mjs';
import { VERBS, DEFAULT_STAGES, loadConfig, resolveStage } from '../.aidlc/lib/config.mjs';
import { ROOT, A } from './_paths.mjs';

const fixture = (name) => readFileSync(path.join(ROOT, 'test/fixtures', name), 'utf8');

test('a surviving mutant becomes one finding, with the file and the line it survived on', () => {
  const findings = normalize('mutation', fixture('stryker-mutation-report.json'), '', 0);
  assert.ok(findings.length >= 3, `${findings.length} findings from a report with known survivors`);

  // The planted one: `src/http/handler.ts` has no test at all, so its mutant survives.
  const planted = findings.find((f) => f.file === 'src/http/handler.ts');
  assert.ok(planted, findings.map((f) => f.file).join(', '));
  assert.equal(planted.rule, 'mutation/survived');
  assert.ok(planted.line > 0, 'a mutant with no line is a finding nobody can act on');
  assert.match(planted.message, /survived/);
  // The sensors article's rule: the fix line is written for the model, and it says what judgment
  // to make rather than "fix the violation".
  assert.match(planted.fix, /strengthen the assertion|suppress with a `why:`/);

  // A killed mutant is not a finding: the suite did its job.
  const report = JSON.parse(fixture('stryker-mutation-report.json'));
  const mutants = Object.values(report.files).flatMap((f) => f.mutants);
  assert.ok(mutants.some((m) => m.status === 'Killed'), 'the fixture has no killed mutants to ignore');
  assert.equal(findings.length, mutants.filter((m) => ['Survived', 'NoCoverage'].includes(m.status)).length);

  // An uncovered mutant says something different in the same breath, and says so.
  const uncovered = normalize('mutation', JSON.stringify({
    files: { 'src/a.ts': { mutants: [{ status: 'NoCoverage', mutatorName: 'Block', location: { start: { line: 9 } } }] } },
  }), '', 0);
  assert.equal(uncovered[0].rule, 'mutation/no-coverage');
  assert.match(uncovered[0].fix, /no test executes this line/);
});

test('a layer violation becomes one finding naming the module that reaches across', () => {
  const findings = normalize('depcruise', fixture('depcruise-violation.json'), '', 0);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, 'src/slug.ts');
  assert.equal(findings[0].rule, 'layers/core-must-not-import-http');
  assert.match(findings[0].message, /src\/slug\.ts → src\/http\/handler\.ts/);
  assert.match(findings[0].fix, /invert it/);
  // Dependency-cruiser reasons about modules, not lines. Reported as 0 rather than invented: a
  // rule about "this module may not import that one" has no line to point at.
  assert.equal(findings[0].line, 0);

  // A clean run is no findings, not an empty-report error.
  assert.deepEqual(normalize('depcruise', JSON.stringify({ summary: { violations: [] } }), '', 0), []);

  // The Python half of the same verb.
  const python = normalize('import-linter', [
    'Layers BROKEN',
    '- app.core -> app.http',
  ].join('\n'), '', 1);
  assert.equal(python.length, 1);
  assert.equal(python[0].file, 'app/core.py');
  assert.equal(python[0].rule, 'layers/Layers');
  assert.match(python[0].message, /breaks the "Layers" contract/);
});

test('a semgrep hit keeps its rule id, its line and its own message', () => {
  const findings = normalize('semgrep', JSON.stringify({
    results: [{
      check_id: 'javascript.lang.security.audit.code-string-concat',
      path: 'src/http/handler.ts',
      start: { line: 12, col: 3 },
      extra: { message: 'User input concatenated into a command string.' },
    }],
    errors: [],
  }), '', 1);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, 'src/http/handler.ts');
  assert.equal(findings[0].line, 12);
  assert.equal(findings[0].rule, 'javascript.lang.security.audit.code-string-concat');
  assert.match(findings[0].message, /concatenated/);
  assert.match(findings[0].fix, /judgment call|suppress with a `why:`/);
  assert.deepEqual(normalize('semgrep', JSON.stringify({ results: [] }), '', 0), []);
});

test('the three verbs are declared, documented, and in no default stage', () => {
  for (const verb of ['mutation', 'sast', 'layers']) {
    assert.ok(VERBS.includes(verb), `${verb} is not a declared verb, so the runner would not recognise it`);
    for (const [stage, entries] of Object.entries(DEFAULT_STAGES)) {
      assert.ok(!entries.includes(verb), `${verb} is in the default ${stage} stage — opt-in means opt-in`);
    }
  }
  for (const format of ['mutation', 'semgrep', 'depcruise', 'import-linter']) {
    assert.ok(KNOWN_FORMATS.includes(format), `${format} has no normaliser`);
  }

  const template = readFileSync(path.join(A, 'templates/harness.toml'), 'utf8');
  for (const verb of ['mutation', 'sast', 'layers']) {
    assert.match(template, new RegExp(`^${verb}\\s+= ""$`, 'm'), `${verb} must ship empty`);
    for (const stage of Object.keys(DEFAULT_STAGES)) {
      const line = new RegExp(`^${stage}\\s*=.*"${verb}"`, 'm');
      assert.doesNotMatch(template, line, `${verb} is in the template's ${stage} stage`);
    }
  }
  // A command a project can paste is the difference between a documented verb and a declared one.
  assert.match(template, /semgrep --config auto/);
  assert.match(template, /stryker run/);
  assert.match(template, /depcruise|lint-imports/);
  assert.match(readFileSync(path.join(ROOT, 'docs/OPERATING.md'), 'utf8'), /## Opt-in verbs/);
});

test('the TypeScript example demonstrates both, and only the cheap one runs on a schedule', () => {
  const cfg = loadConfig(path.join(ROOT, 'examples/scratch-ts'));
  assert.match(cfg.capabilities.layers, /depcruise/);
  assert.equal(cfg.formats.layers, 'depcruise');
  assert.match(cfg.capabilities.mutation, /stryker run/);
  assert.equal(cfg.formats.mutation, 'mutation');

  // `layers` is seconds and runs in drift, which CI exercises. `mutation` is configured and
  // reachable from no stage: a mutation run is a decision a project makes, not something a stage
  // does to it, and that is the whole content of "opt-in".
  assert.ok(resolveStage(cfg, 'drift').includes('layers'));
  for (const stage of Object.keys(cfg.stages)) {
    assert.ok(!resolveStage(cfg, stage).includes('mutation'), `mutation is reachable from ${stage}`);
  }

  // And the harness's own jobs are untouched: no mutation run entered this repository's CI.
  const workflow = readFileSync(path.join(ROOT, '.github/workflows/harness.yml'), 'utf8');
  assert.doesNotMatch(workflow, /stryker|semgrep|mutmut/);
});
