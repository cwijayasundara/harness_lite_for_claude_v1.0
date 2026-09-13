// G13. The two controls that replace `test_quality`.
//
// `test_quality` counted `test(` occurrences in files whose names looked like tests. It could not
// tell a suite from a file of comments, and across roughly ninety recorded invocations it never
// fired once. What replaces it is two smaller claims that are true: coverage does not fall, and
// every approved behaviour names proof that still exists.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { parseLcov, parseCoveragePy, linesPct, reportCandidates } from '../.aidlc/lib/coverage.mjs';
import * as baseline from '../.aidlc/lib/baseline.mjs';
import { run as baselineCheck } from '../.aidlc/checks/baseline.mjs';
import { proofRows, run as proofCheck } from '../.aidlc/checks/proof.mjs';
import { loadConfig, VERBS, DEFAULT_SENSOR_PROFILES, resolveStage } from '../.aidlc/lib/config.mjs';
import { render } from '../.aidlc/lib/artifacts.mjs';
import { layout } from '../.aidlc/lib/paths.mjs';
import { BIN, ROOT, A } from './_paths.mjs';

const LCOV = 'TN:\nSF:src/a.js\nLF:10\nLH:8\nend_of_record\nTN:\nSF:src/b.js\nLF:10\nLH:7\nend_of_record\n';

test('a coverage percentage is read from lcov and from coverage.py, and never invented', () => {
  // Derived from the totals, not averaged per file: lcov has no total line, and a mean of
  // per-file percentages is not a coverage figure.
  assert.equal(parseLcov(LCOV), 75);
  assert.equal(parseLcov('TN:\nSF:src/a.js\nend_of_record\n'), null, 'no lines found is not 0% covered');
  assert.equal(parseLcov('not lcov at all'), null);
  assert.equal(parseCoveragePy(JSON.stringify({ totals: { percent_covered: 91.2345 } })), 91.23);
  assert.equal(parseCoveragePy('{"totals":{}}'), null);
  assert.equal(parseCoveragePy('{'), null);
});

test('the report is looked for where the project told the runner to write it', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'coverage-'));
  try {
    const cfg = { layout: layout(root), capabilities: {}, formats: {} };
    assert.equal(linesPct(cfg), null, 'no coverage verb is unmeasured, not zero');

    cfg.capabilities.coverage = 'node --test --test-reporter-destination=coverage/lcov.info';
    cfg.formats.coverage = 'lcov';
    assert.ok(reportCandidates(cfg).some((p) => p.endsWith('coverage/lcov.info')));
    assert.equal(linesPct(cfg), null, 'a configured verb with no report is still unmeasured');

    mkdirSync(path.join(root, 'coverage'), { recursive: true });
    writeFileSync(path.join(root, 'coverage/lcov.info'), LCOV);
    assert.equal(linesPct(cfg), 75);

    // The `{report}` path the runner hands the command wins, because it is where the runner looked.
    mkdirSync(path.join(root, '.aidlc/state'), { recursive: true });
    writeFileSync(path.join(root, '.aidlc/state/coverage-report.json'), JSON.stringify({ totals: { percent_covered: 42 } }));
    cfg.formats.coverage = 'coverage.py';
    assert.equal(linesPct(cfg), 42);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('coverage is graded downward in percentage points, and an unmeasured side is not graded', () => {
  const base = { tolerance: 1.10, coverage_drop_pct: 1.0, claude_md_tokens: 100, session_context_tokens: 50,
    check_stop_tokens: 20, pack_tokens_p50: 10, coverage_lines_pct: 81.5 };
  const row = (now) => baseline.compare(base, { ...base, ...now }).rows.find((r) => r.metric === 'coverage_lines_pct');

  assert.equal(row({ coverage_lines_pct: 81.5 }).regressed, false);
  assert.equal(row({ coverage_lines_pct: 80.8 }).regressed, false, 'a line moving between files is not a regression');
  assert.equal(row({ coverage_lines_pct: 80.0 }).regressed, true);
  assert.equal(row({ coverage_lines_pct: 95 }).regressed, false, 'more coverage is not a regression');
  // The ratchet's own tolerance would have let nine points go: this is why it is a separate list.
  assert.ok(baseline.RATCHETED.every((m) => m !== 'coverage_lines_pct'));
  assert.deepEqual(baseline.FLOORED, ['coverage_lines_pct']);

  for (const unmeasured of [{ coverage_lines_pct: null }, { coverage_lines_pct: undefined }]) {
    const r = row(unmeasured);
    assert.equal(r.regressed, false);
    assert.match(r.skipped, /unmeasured/);
  }
  assert.equal(baseline.compare({ ...base, coverage_lines_pct: null }, { ...base }).rows
    .find((r) => r.metric === 'coverage_lines_pct').regressed, false, 'no recorded figure is not a drop');
});

// A project with no dependencies at all: node's own test runner writes lcov, which is why the
// detector chooses it. The whole ratchet is exercised here — capture, plant, fail — with no
// install step, which is what "runs on a cold clone" has to mean for this control too.
function nodeProject() {
  const root = mkdtempSync(path.join(tmpdir(), 'ratchet-'));
  const write = (rel, body) => { mkdirSync(path.join(root, path.dirname(rel)), { recursive: true }); writeFileSync(path.join(root, rel), body); };
  write('package.json', JSON.stringify({ name: 'ratchet', type: 'module', private: true }, null, 2));
  write('src/calc.mjs', 'export const add = (a, b) => a + b;\nexport const sub = (a, b) => a - b;\n');
  write('test/calc.test.mjs', `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { add, sub } from '../src/calc.mjs';
test('add', () => assert.equal(add(1, 2), 3));
test('sub', () => assert.equal(sub(3, 1), 2));
`);
  assert.equal(spawnSync(process.execPath, [BIN, 'init', '--into', root], { cwd: root, encoding: 'utf8' }).status, 0);
  return { root, write, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('a planted coverage drop is caught by the ratchet, end to end, with no dependency to install', async () => {
  const p = nodeProject();
  try {
    const cfg = loadConfig(p.root);
    assert.match(cfg.capabilities.coverage, /--experimental-test-coverage/, 'detection did not configure coverage');

    const captured = await baseline.capture(cfg);
    assert.ok(Number.isFinite(captured.coverage_lines_pct), 'nothing was measured');
    assert.equal(captured.coverage_drop_pct, baseline.DEFAULT_COVERAGE_DROP_PCT);
    baseline.save(cfg, captured);

    // The plant: lines arriving in a covered module with no test behind them. It has to be a
    // module the suite already loads — node reports coverage for files it executed, so a module
    // nothing imports is invisible to it rather than uncovered, which is a different claim.
    p.write('src/calc.mjs', readFileSync(path.join(p.root, 'src/calc.mjs'), 'utf8')
      + Array.from({ length: 40 }, (_, i) => `export const untested${i} = () => {\n  return ${i};\n};`).join('\n') + '\n');
    const dropped = await baseline.capture(cfg);
    assert.ok(dropped.coverage_lines_pct < captured.coverage_lines_pct, 'the plant did not move the figure');

    const result = baseline.compare(captured, dropped);
    const row = result.rows.find((r) => r.metric === 'coverage_lines_pct');
    assert.equal(row.regressed, true, `${row.was} -> ${row.is}`);
    assert.equal(result.ok, false);

    // And as a finding, in the words a reader acts on: points, and a downward direction.
    const check = await baselineCheck(cfg, [], null);
    const finding = check.findings.find((f) => f.rule === 'baseline/coverage_lines_pct');
    assert.equal(check.verdict, 'fail');
    assert.ok(finding, JSON.stringify(check.findings));
    assert.match(finding.message, /points/);
    assert.doesNotMatch(finding.message, /\+\d/, 'a drop reported as a rise reads as its own opposite');
    assert.match(finding.fix, /cover what the change added/);
  } finally { p.cleanup(); }
});

function planned(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'proof-'));
  const dir = path.join(root, '.aidlc/artifacts/addition');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'intent.md'), '# Addition\n');
  writeFileSync(path.join(dir, 'spec.md'), render({ status: 'approved', by: 'tester', at: '2026-09-13T00:00:00.000Z' },
    '# Addition\n\n### B1\nAdd two integers.\n\n### B2\nSubtract two integers.\n'));
  writeFileSync(path.join(dir, 'plan.md'), render({ status: 'approved', by: 'tester', at: '2026-09-13T00:00:00.000Z' },
    `# Plan\n\n## Files\n\n\`src/sum.mjs\`\n\n## Proof\n\n| Behaviour | Test or evidence |\n|---|---|\n${files}`));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('a behaviour with no proof row, or a row naming something gone, fails proof', async () => {
  // B2 has no row at all.
  const missing = planned('| B1 | `test/sum.test.mjs` |\n');
  try {
    mkdirSync(path.join(missing.root, 'test'), { recursive: true });
    writeFileSync(path.join(missing.root, 'test/sum.test.mjs'), 'test("adds", () => {});\n');
    const r = proofRows(missing.root);
    assert.equal(r.ok, false);
    assert.equal(r.checked, 2);
    assert.match(r.violations.join('\n'), /B2: plan\.md's Proof table names no row/);

    const check = await proofCheck({ layout: layout(missing.root) });
    assert.equal(check.verdict, 'fail');
    assert.equal(check.findings[0].rule, 'proof/missing');
    assert.match(check.findings[0].file, /addition\/plan\.md$/);
    assert.match(check.findings[0].fix, /## Proof table/);
  } finally { missing.cleanup(); }

  // Both rows name a file nobody ever wrote.
  const gone = planned('| B1 | `test/sum.test.mjs` |\n| B2 | `test/sum.test.mjs` |\n');
  try {
    const r = proofRows(gone.root);
    assert.equal(r.ok, false);
    assert.equal(r.violations.length, 2);
    assert.match(r.violations[0], /does not exist/);
  } finally { gone.cleanup(); }

  // Runtime evidence is not a violation: the plan skill permits it where automation is dishonest.
  const runtime = planned('| B1 | `test/sum.test.mjs` |\n| B2 | Operator runs the CLI against a live queue and records the output |\n');
  try {
    mkdirSync(path.join(runtime.root, 'test'), { recursive: true });
    writeFileSync(path.join(runtime.root, 'test/sum.test.mjs'), 'test("adds", () => {});\n');
    const r = proofRows(runtime.root);
    assert.equal(r.ok, true);
    assert.deepEqual(r.unverifiable, ['addition B2']);
    const check = await proofCheck({ layout: layout(runtime.root) });
    assert.equal(check.verdict, 'pass');
    assert.match(check.note, /1 name evidence rather than a test/);
  } finally { runtime.cleanup(); }

  // An empty repository is reported as checked: 0 rather than passed.
  const empty = mkdtempSync(path.join(tmpdir(), 'proof-empty-'));
  try {
    const r = proofRows(empty);
    assert.equal(r.ok, true);
    assert.equal(r.checked, 0);
  } finally { rmSync(empty, { recursive: true, force: true }); }
});

test('test_quality is gone from the verb list, the profiles, the registries and the tree', () => {
  assert.ok(!VERBS.includes('test_quality'), 'a control nobody can act on is still a declared verb');
  for (const profile of Object.values(DEFAULT_SENSOR_PROFILES)) assert.ok(!profile.includes('test_quality'));
  assert.equal(existsSync(path.join(A, 'sensors/test-quality.mjs')), false, 'the sensor file is still shipped');

  const template = readFileSync(path.join(A, 'templates/harness.toml'), 'utf8');
  assert.doesNotMatch(template, /test_quality/);
  assert.match(template, /^commit = \[.*"proof"\]$/m, 'a project starting today gets proof in its commit stage');

  // This repository runs it in `drift` instead: 14 historical rows name test files that later
  // changes deleted, which is delivered work with stale evidence for G03 to close, not a reason
  // to block every commit on archaeology. The control still runs, and still reports.
  const cfg = loadConfig(ROOT);
  assert.ok(resolveStage(cfg, 'drift').includes('proof'));
  assert.ok(!resolveStage(cfg, 'commit').includes('test_quality'));
  assert.equal(cfg.deterrents.proof, 'test/coverage-and-proof.test.mjs', '[deterrents] must name the test that plants the defect');
});
