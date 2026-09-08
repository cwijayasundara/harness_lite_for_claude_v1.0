import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { stage, FIXTURES } from '../evals/lib/stage.mjs';
import { loadConfig } from '../.aidlc/lib/config.mjs';
import { check } from '../.aidlc/lib/runner.mjs';
import { testExecution } from '../.aidlc/lib/normalize.mjs';
import { traceFixture } from './_trace-fixture.mjs';
import * as a from '../.aidlc/lib/artifacts.mjs';

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commit = root => { git(root, 'add', '-A'); git(root, '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'Simulated trace product'); return git(root, 'rev-parse', 'HEAD'); };
const passed = nodeid => ({ nodeid, outcome: 'passed', setup: { outcome: 'passed' }, call: { outcome: 'passed' }, teardown: { outcome: 'passed' } });

test('observations reject malformed results and never infer a passed call', () => {
  for (const payload of ['bad', '{}', '{"exitcode":0,"tests":[{}]}']) assert.equal(testExecution('pytest', payload).status, 'malformed');
  assert.equal(testExecution('generic', '{}').status, 'unsupported');
  assert.equal(testExecution('pytest', JSON.stringify({ exitcode: 0, tests: [{ nodeid: 'tests/a.py::test_a', outcome: 'passed' }] })).tests[0].outcome, 'unverified');
});

test('candidate trace joins exact proof to current observations; negatives never become passed proof', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const cfg = { ...loadConfig(s.work), formats: { test: 'pytest' }, stages: { trace: ['test'], fast: [] } };
    const slug = 'hyphen-titlecase';
    const spec = a.read(cfg, slug, 'spec');
    writeFileSync(spec.file, a.render({ status: 'draft' }, spec.body));
    traceFixture(s.work); commit(s.work);
    for (const kind of ['spec', 'plan']) { a.approve(cfg, slug, kind, { by: 'simulated-test-driver' }); commit(s.work); }
    const base = git(s.work, 'rev-parse', 'HEAD');
    // Runtime subprocess emits explicitly simulated pytest JSON to exercise the adapter,
    // independently of whether Python is installed in the zero-dependency unit environment.
    const emitter = path.join(s.work, 'tests/observations.json');
    const testReport = { exitcode: 0, tests: [passed('tests/test_app.py::test_titlecase_hyphenated'), passed('tests/test_app.py::test_titlecase')] };
    writeFileSync(emitter, JSON.stringify(testReport));
    const candidate = commit(s.work);
    cfg.capabilities = { test: 'cat tests/observations.json' };
    const options = { stage: 'trace', base, candidate, change: slug, write: false };
    // Extra evidence file is intentionally out of scope, so allow all controls to run;
    // the trace may observe tests even though overall scope verification fails.
    options.all = true;
    const report = await check(cfg, options);
    assert.deepEqual(report.trace.behaviours.map(b => b.status), ['passed', 'passed']);
    assert.equal(report.trace.context, 'candidate');
    assert.equal(report.trace.approvals.spec.binding, 'v2');
    assert.deepEqual(report.trace.behaviours[0].criteria, ['local:fixture-B1']);
    assert.equal(report.trace.source.kind, 'external-asserted');
    assert.equal(report.trace.execution.command, 'cat tests/observations.json');
    const fast = await check(cfg, { ...options, stage: 'fast' });
    assert.deepEqual(fast.trace.behaviours.map(b => b.status), ['not-executed', 'not-executed']);
    for (const [tests, expected] of [
      [[], 'not-executed'],
      [[{ nodeid: testReport.tests[0].nodeid, outcome: 'skipped' }], 'skipped'],
      [[{ nodeid: testReport.tests[0].nodeid, outcome: 'failed' }], 'failed'],
      [[testReport.tests[0], testReport.tests[0]], 'ambiguous'],
    ]) {
      writeFileSync(emitter, JSON.stringify({ exitcode: 0, tests }));
      const next = commit(s.work);
      const out = await check(cfg, { ...options, candidate: next });
      assert.equal(out.trace.behaviours[0].status, expected);
    }
    // A successful process with no fresh report cannot reuse the previous file's evidence.
    writeFileSync(cfg.layout.state + '/test-report.json', JSON.stringify(testReport));
    cfg.capabilities.test = 'true';
    const stale = await check(cfg, { ...options, candidate: git(s.work, 'rev-parse', 'HEAD') });
    assert.equal(stale.trace.behaviours[0].status, 'unverified');
    cfg.capabilities.test = 'cat tests/observations.json';
    writeFileSync(emitter, JSON.stringify(testReport));
    const local = await check(cfg, { stage: 'trace', write: false });
    assert.equal(local.trace.context, 'local/unverified');
    assert.equal(local.trace.behaviours[0].status, 'unverified');
  } finally { s.cleanup(); }
});

test('a test command that mutates tracked candidate input invalidates revision evidence', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const sha = git(s.work, 'rev-parse', 'HEAD');
    const cfg = { ...loadConfig(s.work), capabilities: { test: "printf 'changed' >> src/app/text.py" }, formats: { test: 'generic' }, stages: { trace: ['test'] } };
    const out = await check(cfg, { stage: 'trace', base: sha, candidate: sha, change: 'hyphen-titlecase', write: false });
    assert.equal(out.ok, false);
    assert.equal(out.trace.context, 'local/unverified');
    assert.ok(out.controls.some(c => c.error?.includes('candidate changed during checks')));
  } finally { s.cleanup(); }
});

// Optional external product toolchain; the harness itself retains zero dependencies.
test('real product pytest execution, correction/reapproval and skipped/unexecuted proof', { skip: !process.env.HARNESS_TRACE_PYTHON }, async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const cfg = { ...loadConfig(s.work), formats: { test: 'pytest' }, stages: { trace: ['test'] } };
    const slug = 'hyphen-titlecase', spec = a.read(cfg, slug, 'spec');
    writeFileSync(spec.file, a.render({ status: 'draft' }, spec.body));
    traceFixture(s.work); commit(s.work);
    const approve = () => { for (const kind of ['spec', 'plan']) { a.approve(cfg, slug, kind, { by: 'simulated-product-reviewer' }); commit(s.work); } };
    approve();
    const base = git(s.work, 'rev-parse', 'HEAD');
    const tests = path.join(s.work, 'tests/test_app.py');
    writeFileSync(tests, readFileSync(tests, 'utf8') + '\n\ndef test_titlecase_hyphenated():\n    assert titlecase("mary-jane watson") == "Mary-Jane Watson"\n');
    const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
    const command = `PYTHONPATH=src ${quote(process.env.HARNESS_TRACE_PYTHON)} -m pytest --json-report --json-report-file={report} -q tests/test_app.py`;
    cfg.capabilities = { test: command };
    const run = () => check(cfg, { stage: 'trace', base, candidate: git(s.work, 'rev-parse', 'HEAD'), change: slug, write: false });
    commit(s.work);
    const failing = await run();
    assert.equal(failing.ok, false);
    assert.equal(failing.trace.behaviours[0].status, 'failed');
    const product = path.join(s.work, 'src/app/text.py');
    writeFileSync(product, 'def titlecase(value: str) -> str:\n    return " ".join("-".join(part[:1].upper() + part[1:] for part in word.split("-")) for word in value.split(" "))\n');
    commit(s.work);
    const passing = await run();
    assert.equal(passing.ok, true, JSON.stringify(passing));
    assert.deepEqual(passing.trace.behaviours.map(b => b.status), ['passed', 'passed']);
    const intent = a.read(cfg, slug, 'intent');
    writeFileSync(intent.file, intent.text + '\nClarification: preserve the existing space-separated behavior.\n');
    commit(s.work);
    const stale = await run();
    assert.equal(stale.ok, false);
    assert.equal(stale.trace.approvals.spec.state, 'stale-approval');
    approve();
    const reapproved = await run(); assert.equal(reapproved.ok, true);
    cfg.capabilities.test = command + ' -k test_render_name';
    const unexecuted = await run();
    assert.deepEqual(unexecuted.trace.behaviours.map(b => b.status), ['not-executed', 'not-executed']);
    cfg.capabilities.test = command;
    writeFileSync(tests, readFileSync(tests, 'utf8').replace('def test_titlecase_hyphenated():', '@pytest.mark.skip(reason="simulated unavailable prerequisite")\ndef test_titlecase_hyphenated():'));
    commit(s.work);
    const skipped = await run(); assert.equal(skipped.trace.behaviours[0].status, 'skipped');
    if (process.env.HARNESS_TRACE_EVIDENCE) writeFileSync(process.env.HARNESS_TRACE_EVIDENCE,
      JSON.stringify({ simulation: 'disposable existing product; simulated approval decisions; real pytest execution', failing, passing, stale, reapproved, unexecuted, skipped }, null, 2) + '\n');
  } finally { s.cleanup(); }
});
