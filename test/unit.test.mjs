// Zero dependencies, runs on a cold clone: node --test test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedRuntimeRecord } from './_runtime-fixture.mjs';
import { ROOT } from './_paths.mjs';
import { parseToml } from '../.aidlc/lib/toml.mjs';
import { resolveStage, DEFAULT_STAGES } from '../.aidlc/lib/config.mjs';
import { normalize } from '../.aidlc/lib/normalize.mjs';

test('toml: tables, types, arrays, comments', () => {
  const t = parseToml(`
# a comment
[project]
name = "acme"          # trailing comment
[capabilities]
lint = "ruff check --output-format=json {files}"
typecheck = ""
[stages]
fast = ["fmt", "lint"]
[budget]
ceiling = 4.0
soft = 140000
on = true
`);
  assert.equal(t.project.name, 'acme');
  assert.equal(t.capabilities.typecheck, '');
  assert.deepEqual(t.stages.fast, ['fmt', 'lint']);
  assert.equal(t.budget.ceiling, 4);
  assert.equal(t.budget.soft, 140000);
  assert.equal(t.budget.on, true);
});

test('toml: a # inside a quoted value is not a comment', () => {
  const t = parseToml('[a]\nb = "x # y"');
  assert.equal(t.a.b, 'x # y');
});

test('stages: one level of indirection resolves and de-duplicates', () => {
  const cfg = { stages: DEFAULT_STAGES };
  assert.deepEqual(resolveStage(cfg, 'fast'), ['fmt', 'lint', 'typecheck']);
  assert.deepEqual(resolveStage(cfg, 'stop'), ['fmt', 'lint', 'typecheck', 'test']);
});

test('stages: a cycle is an error, not a hang', () => {
  const cfg = { stages: { a: ['b'], b: ['a'] } };
  assert.throws(() => resolveStage(cfg, 'a'), /cycle/);
});

test('stages: an unknown stage names the ones that exist', () => {
  assert.throws(() => resolveStage({ stages: DEFAULT_STAGES }, 'nope'), /known: fast, stop/);
});

test('normalize: ruff json becomes the one finding schema', () => {
  const out = normalize('ruff', JSON.stringify([
    { filename: 'a.py', location: { row: 3 }, code: 'F401', message: 'unused import', fix: { message: 'remove it' } },
  ]), '', 1);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { file: 'a.py', line: 3, rule: 'F401', message: 'unused import', fix: 'remove it' });
});

test('normalize: eslint json flattens per-file messages', () => {
  const out = normalize('eslint', JSON.stringify([
    { filePath: '/x/a.js', messages: [{ line: 2, ruleId: 'no-var', message: 'no var' }] },
  ]), '', 1);
  assert.equal(out[0].rule, 'no-var');
});

test('normalize: an unparseable sensor can still say no', () => {
  const out = normalize('ruff', 'not json at all', 'boom on line 9', 1);
  assert.equal(out.length, 1);
  assert.equal(out[0].rule, 'harness/unparseable-output');
  assert.match(out[0].message, /boom on line 9/);
});

test('normalize: a generic tool exiting zero produces no findings', () => {
  assert.deepEqual(normalize('generic', 'all good', '', 0), []);
});

test('normalize: a generic tool exiting non-zero produces exactly one', () => {
  const out = normalize('generic', '', 'FAILED tests/test_a.py::test_b', 1);
  assert.equal(out.length, 1);
  assert.equal(out[0].rule, 'exit-nonzero');
});

test('runner inherits this process PATH instead of a login shell', async () => {
  const { spawnSync } = await import('node:child_process');
  if (spawnSync('python3', ['-c', 'import pytest'], { env: process.env }).status !== 0) return;
  const { check } = await import('../.aidlc/lib/runner.mjs');
  const os = await import('node:os');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-path-'));
  seedRuntimeRecord(root);
  fs.mkdirSync(path.join(root, '.claude', 'state'), { recursive: true });
  const cfg = {
    capabilities: { test: 'python3 -c "import pytest"' },
    formats: { test: 'generic' }, stages: { fast: ['test'] },
    budget: { max_findings: 20 },
    layout: { root, state: path.join(root, '.aidlc/state'), ledger: path.join(root, '.aidlc/state/ledger.jsonl'), lastCheck: path.join(root, '.aidlc/state/last-check.json'), runId: path.join(root, '.aidlc/state/run-id') },
  };
  const r = await check(cfg, { stage: 'fast' });
  assert.equal(r.controls[0].verdict, 'pass', r.controls[0].error || r.controls[0].findings.map((f) => f.message).join(' | '));
  fs.rmSync(root, { recursive: true, force: true });
});

test('runner: a missing tool is errored, not failed', async () => {
  const { check } = await import('../.aidlc/lib/runner.mjs');
  const os = await import('node:os');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-'));
  seedRuntimeRecord(root);
  fs.mkdirSync(path.join(root, '.claude', 'state'), { recursive: true });
  const cfg = {
    capabilities: { lint: 'definitely-not-a-real-binary-xyz' },
    formats: {}, stages: { fast: ['lint'] },
    budget: { max_findings: 20 },
    layout: { root, state: path.join(root, '.aidlc/state'), ledger: path.join(root, '.aidlc/state/ledger.jsonl'), lastCheck: path.join(root, '.aidlc/state/last-check.json'), runId: path.join(root, '.aidlc/state/run-id') },
  };
  const r = await check(cfg, { stage: 'fast' });
  assert.equal(r.controls[0].verdict, 'errored');
  assert.match(r.controls[0].error, /tool not installed/);
  // A configured check that could not execute has not verified the change.
  assert.equal(r.ok, false);
  const rows = fs.readFileSync(cfg.layout.ledger, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rows.find(r => r.control === 'lint').verdict, 'errored');
  fs.rmSync(root, { recursive: true, force: true });
});

test('runner: an explicit secrets command overrides the built-in fallback', async () => {
  const { check } = await import('../.aidlc/lib/runner.mjs');
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-secrets-'));
  seedRuntimeRecord(root);
  const state = path.join(root, '.aidlc/state'); fs.mkdirSync(state, { recursive: true });
  const cfg = { capabilities: { secrets: 'echo configured-scanner >&2; exit 1' }, formats: { secrets: 'generic' }, stages: { s: ['secrets'] }, check: { fail_fast: true }, budget: { max_findings: 20 }, layout: { root, state, ledger: path.join(state, 'ledger.jsonl'), lastCheck: path.join(state, 'last.json'), runId: path.join(state, 'run-id') } };
  const report = await check(cfg, { stage: 's' });
  assert.equal(report.ok, false);
  assert.match(report.controls[0].findings[0].message, /configured-scanner/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('normalize: TAP failures carry file, line and reason', async () => {
  const { normalize } = await import('../.aidlc/lib/normalize.mjs');
  const tap = [
    'TAP version 13',
    '# Subtest: slugify lowercases',
    'ok 1 - slugify lowercases',
    '# Subtest: linkFor composes a path',
    'not ok 2 - linkFor composes a path',
    '  ---',
    "  location: '/repo/dist/test/slug.test.js:14:1'",
    "  error: 'Expected values to be strictly equal'",
    '  ...',
    '1..2',
  ].join('\n');
  const out = normalize('tap', tap, '', 1);
  assert.equal(out.length, 1, 'passing tests are not findings');
  assert.equal(out[0].line, 14);
  assert.match(out[0].file, /slug\.test\.js$/);
  assert.match(out[0].message, /strictly equal/);
  assert.equal(out[0].rule, 'test-failed');
});

// A control that cannot fail is not a control. A stale glob in [checks].test left the suite
// reporting PASS in 31ms while running nothing at all — bash passes an unmatched glob through
// literally, node --test emits a well-formed empty report, and exit 0 reads as success.
test('normalize: a TAP run that executed nothing is a failure, not a pass', async () => {
  const { normalize } = await import('../.aidlc/lib/normalize.mjs');
  const empty = ['TAP version 13', '1..0', '# tests 0', '# pass 0', '# fail 0'].join('\n');
  const out = normalize('tap', empty, '', 0);
  assert.equal(out.length, 1, 'an empty suite must produce exactly one finding');
  assert.equal(out[0].rule, 'harness/empty-suite');
  assert.match(out[0].message, /no tests/i);
  assert.match(out[0].fix, /harness\.toml|\[checks\]/, 'the fix must name where to look');
});

test('normalize: a healthy TAP run is not flagged as empty', async () => {
  const { normalize } = await import('../.aidlc/lib/normalize.mjs');
  const healthy = ['TAP version 13', 'ok 1 - slugify lowercases', '1..1', '# tests 1', '# pass 1', '# fail 0'].join('\n');
  assert.deepEqual(normalize('tap', healthy, '', 0), [], 'a green suite has no findings');
});

test('normalize: a suite that ran and failed is a test failure, not an empty suite', async () => {
  const { normalize } = await import('../.aidlc/lib/normalize.mjs');
  const failed = ['TAP version 13', 'not ok 1 - adds', '1..1', '# tests 1', '# pass 0', '# fail 1'].join('\n');
  const out = normalize('tap', failed, '', 1);
  assert.equal(out.length, 1);
  assert.equal(out[0].rule, 'test-failed', 'a real failure must not be relabelled');
});

test('check: fail-fast stops at the first failure and records what it skipped', async () => {
  const { check } = await import('../.aidlc/lib/runner.mjs');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-ff-'));
  seedRuntimeRecord(root);
  fs.mkdirSync(path.join(root, '.claude', 'state'), { recursive: true });
  const layout = { root, state: path.join(root, '.aidlc/state'), ledger: path.join(root, '.aidlc/state/ledger.jsonl'), lastCheck: path.join(root, '.aidlc/state/last.json'), runId: path.join(root, '.aidlc/state/run-id') };
  const cfg = {
    capabilities: { lint: 'exit 1', typecheck: 'exit 0', test: 'exit 0' },
    formats: {}, stages: { s: ['lint', 'typecheck', 'test'] },
    budget: { max_findings: 20 }, check: { fail_fast: true }, layout,
  };
  const fast = await check(cfg, { stage: 's' });
  assert.deepEqual(fast.controls.map((c) => c.verdict), ['fail', 'skipped', 'skipped']);
  assert.match(fast.controls[1].note, /lint failed first/);

  const full = await check(cfg, { stage: 's', all: true });
  assert.deepEqual(full.controls.map((c) => c.verdict), ['fail', 'pass', 'pass']);

  // Skipped verbs are ledgered. A verb that did not run must not quietly flatter its own stats.
  const rows = fs.readFileSync(layout.ledger, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rows.filter((r) => r.verdict === 'skipped').length, 2);

  cfg.capabilities.lint = 'definitely-not-a-real-binary-xyz';
  const broken = await check(cfg, { stage: 's' });
  assert.equal(broken.ok, false);
  assert.deepEqual(broken.controls.map((c) => c.verdict), ['errored', 'skipped', 'skipped']);
  const diagnostic = await check(cfg, { stage: 's', all: true });
  assert.equal(diagnostic.ok, false);
  assert.deepEqual(diagnostic.controls.map((c) => c.verdict), ['errored', 'pass', 'pass']);

  cfg.capabilities.lint = '';
  const optional = await check(cfg, { stage: 's' });
  assert.equal(optional.ok, true, 'an unused optional capability stays skipped');
  assert.deepEqual(optional.controls.map((c) => c.verdict), ['skipped', 'pass', 'pass']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('baseline: ratchets a rise, tolerates noise, records what has no history', async () => {
  const { compare, RATCHETED } = await import('../.aidlc/lib/baseline.mjs');
  const base = { tolerance: 1.10, claude_md_tokens: 100, session_context_tokens: 50, check_stop_tokens: 20, wiki_index_tokens: 80, pack_tokens_p50: 0 };
  const same = compare(base, { ...base });
  assert.equal(same.ok, true);

  const noise = compare(base, { ...base, claude_md_tokens: 108 });
  assert.equal(noise.ok, true, '8% is under a 10% tolerance');

  const regressed = compare(base, { ...base, claude_md_tokens: 160 });
  assert.equal(regressed.ok, false);
  assert.equal(regressed.rows.find((r) => r.metric === 'claude_md_tokens').regressed, true);

  // A metric with no history is recorded, not graded — same rule as the eval suite's baseline.
  const fresh = compare(base, { ...base, pack_tokens_p50: 99999 });
  assert.equal(fresh.ok, true);
  assert.deepEqual(RATCHETED.filter((k) => !(k in base)), []);
});

test('baseline: every ratcheted metric is actually captured', async () => {
  const { capture, RATCHETED } = await import('../.aidlc/lib/baseline.mjs');
  const { stage } = await import('../evals/lib/stage.mjs');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const s = stage(path.join(ROOT, 'evals', 'fixtures'), 'graph-app');
  try {
    const state = path.join(s.work, '.aidlc/state');
    fs.mkdirSync(state, { recursive: true });
    const cfg = {
      project: { name: 'graph-app' }, capabilities: {}, formats: {},
      stages: { fast: [], stop: [] }, check: { fail_fast: true },
      budget: { max_findings: 20 }, limits: { skills: 12 },
      graph: { include: ['.', '.claude'], exclude: ['.git', '__pycache__'] },
      layout: { root: s.work, claude: path.join(s.work, '.claude'), claudeMd: path.join(s.work, '.claude/CLAUDE.md'),
        aidlc: path.join(s.work, '.aidlc'),
        state, graph: path.join(state, 'graph.json'), ledger: path.join(state, 'ledger.jsonl'), runId: path.join(state, 'run-id') },
    };
    const b = await capture(cfg);
    for (const k of RATCHETED) assert.equal(typeof b[k], 'number', `${k} was not captured`);
    assert.ok(b.graph_modules > 0);
    // Model-side cost is never fabricated here; the eval suite fills it or it stays null.
    assert.equal(b.model, null);
  } finally { s.cleanup(); }
});

// a-baseline-measures-what-ships B1. The ratchet recorded 52 tokens against a payload of ~649,
// because capture() rebuilt four of the hook's lines instead of measuring the hook's string.
// This asserts the two are the same number, which is only possible while they are one function.
test('baseline: session_context_tokens measures the payload the hook actually emits', async () => {
  const { capture } = await import('../.aidlc/lib/baseline.mjs');
  const { estimateTokens } = await import('../.aidlc/lib/pack.mjs');
  const { sessionContext } = await import('../.aidlc/lib/session.mjs');
  const { stage } = await import('../evals/lib/stage.mjs');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const s = stage(path.join(ROOT, 'evals', 'fixtures'), 'graph-app');
  try {
    const state = path.join(s.work, '.aidlc/state');
    fs.mkdirSync(state, { recursive: true });
    const cfg = {
      project: { name: 'graph-app' }, capabilities: {}, formats: {},
      stages: { fast: [], stop: [] }, check: { fail_fast: true },
      budget: { max_findings: 20 }, limits: { skills: 12 },
      graph: { include: ['.', '.claude'], exclude: ['.git', '__pycache__'] },
      layout: { root: s.work, claude: path.join(s.work, '.claude'), claudeMd: path.join(s.work, '.claude/CLAUDE.md'),
        aidlc: path.join(s.work, '.aidlc'),
        state, graph: path.join(state, 'graph.json'), ledger: path.join(state, 'ledger.jsonl'), runId: path.join(state, 'run-id') },
    };
    const b = await capture(cfg);
    assert.equal(b.session_context_tokens, estimateTokens(sessionContext(cfg)),
      'the recorded figure must be the token count of the emitted payload, not of a reconstruction');
    // The four-line reconstruction could not exceed ~60 tokens on any repository. A real payload
    // carries the map, hubs, contract and current-change lines too, so it is always larger.
    assert.ok(sessionContext(cfg).split('\n').length >= 5,
      'a payload of four lines means the reconstruction is back');
  } finally { s.cleanup(); }
});

// B2. One function assembles the payload and both callers use it. A second assembly in the hook
// is the exact defect this change removes, so the test names it rather than trusting review.
test('baseline: the hook emits sessionContext and holds no second assembly of it', async () => {
  const { sessionContext } = await import('../.aidlc/lib/session.mjs');
  const { loadConfig } = await import('../.aidlc/lib/config.mjs');
  const { execFileSync } = await import('node:child_process');
  const fs = await import('node:fs');
  const path = await import('node:path');

  const emitted = JSON.parse(execFileSync('node', [path.join(ROOT, '.aidlc/bin/harness'), 'hook', 'session-start'],
    { cwd: ROOT, input: '{}', encoding: 'utf8' })).hookSpecificOutput.additionalContext;
  // The hook rotates the run id before assembling, so the `ledger:` counters it reports are one
  // run behind the ones an in-process call reports afterwards. That counter is the only part of
  // the payload the act of measuring changes, so it is normalised on both sides rather than
  // raced against; every other line must match exactly, which is what B2 is about.
  const norm = (s) => s.replace(/^ledger: .*$/m, 'ledger: <counts>');
  assert.equal(norm(emitted), norm(sessionContext(loadConfig(ROOT))),
    'the hook must write exactly what sessionContext assembles');
  assert.match(emitted, /^ledger: \d+ rows over \d+ runs \(30d\)$/m, 'the ledger line is still emitted');

  const hook = fs.readFileSync(path.join(ROOT, '.aidlc/hooks/dispatch.mjs'), 'utf8');
  assert.ok(!hook.includes('`harness · ${'), 'dispatch.mjs assembles the payload a second time');
  assert.ok(!hook.includes('ledger: ${'), 'dispatch.mjs assembles the payload a second time');
});

// B3 and B4. The ratchet existed and no stage ran it; this is the gate, and what it reports.
test('baseline: the gate is in commit, grades a rise, and reports a drifted schema', async () => {
  const { LOCAL_CHECKS } = await import('../.aidlc/lib/runner.mjs');
  const { run } = await import('../.aidlc/checks/baseline.mjs');
  const { capture, save } = await import('../.aidlc/lib/baseline.mjs');
  const { stage } = await import('../evals/lib/stage.mjs');
  const fs = await import('node:fs');
  const path = await import('node:path');

  // B3: the control is registered and the commit stage names it. Two lists that must agree.
  const toml = parseToml(fs.readFileSync(path.join(ROOT, '.aidlc/harness.toml'), 'utf8'));
  assert.ok(toml.stages.commit.includes('baseline'), 'commit must run the ratchet');
  assert.ok('baseline' in LOCAL_CHECKS, 'the runner must be able to resolve it');

  const s = stage(path.join(ROOT, 'evals', 'fixtures'), 'graph-app');
  try {
    const aidlc = path.join(s.work, '.aidlc');
    const state = path.join(aidlc, 'state');
    fs.mkdirSync(state, { recursive: true });
    const cfg = {
      project: { name: 'graph-app' }, capabilities: {}, formats: {},
      stages: { fast: [], stop: [] }, check: { fail_fast: true },
      budget: { max_findings: 20 }, limits: { skills: 12 },
      graph: { include: ['.', '.claude'], exclude: ['.git', '__pycache__'] },
      layout: { root: s.work, claude: path.join(s.work, '.claude'), claudeMd: path.join(s.work, '.claude/CLAUDE.md'),
        aidlc, state, graph: path.join(state, 'graph.json'), ledger: path.join(state, 'ledger.jsonl'), runId: path.join(state, 'run-id') },
    };

    // Nothing recorded yet is recorded, not graded.
    assert.equal((await run(cfg)).verdict, 'pass', 'a project with no baseline is not in regression');

    const captured = await capture(cfg);
    save(cfg, captured);
    assert.equal((await run(cfg)).verdict, 'pass', 'a capture compared against itself is green');

    // B3: a recorded figure far below the current one is a regression, and the finding says
    // which metric and both numbers, so the reader never has to re-derive it.
    save(cfg, { ...captured, session_context_tokens: Math.max(1, Math.floor(captured.session_context_tokens / 4)) });
    const risen = await run(cfg);
    assert.equal(risen.verdict, 'fail');
    const row = risen.findings.find((f) => f.rule === 'baseline/session_context_tokens');
    assert.ok(row, 'the finding names the metric that fired');
    assert.match(row.message, new RegExp(String(captured.session_context_tokens)), 'the current figure is reported');
    assert.match(row.message, /recorded \d+/, 'the recorded figure is reported');

    // B4: a key the current capture no longer produces is reported, not silently ignored.
    save(cfg, { ...captured, wiki_index_tokens: 290 });
    const drifted = await run(cfg);
    const unknown = drifted.findings.find((f) => f.rule === 'baseline/unknown-metric');
    assert.ok(unknown, 'a retired key is surfaced');
    assert.match(unknown.message, /wiki_index_tokens/);
  } finally { s.cleanup(); }
});

// the-gate-grades-what-it-can-measure B1. `check_stop_tokens` measures what a GREEN stop stage
// puts in front of the model, and was graded whether or not the stage was green. `capture()`
// re-runs that stage, and `--stage commit` runs by construction on an uncommitted tree where it
// fails — so the gate reported check_stop_tokens = 1888 against a recorded 12, a 157x rise that
// says nothing about the change. Every --stage commit run recorded on 2026-09-09 and 2026-09-10
// passed only because it followed a commit.
//
// ENVIRONMENT_SENSITIVE did not reach it: the skip fires when `errored_controls` differ, and a
// control that FAILS is not a control that ERRORS.
test('baseline: an ungreen stop stage makes check_stop_tokens incomparable, not a regression', async () => {
  const { compare } = await import('../.aidlc/lib/baseline.mjs');
  const green = { tolerance: 1.10, claude_md_tokens: 100, session_context_tokens: 50,
    check_stop_tokens: 12, pack_tokens_p50: 100, errored_controls: [], stop_ok: true };

  // The dirty-tree case: same toolchain, same errored set, but the stage failed, so its rendered
  // output is failure text rather than two PASS lines.
  const dirty = compare(green, { ...green, check_stop_tokens: 1888, stop_ok: false });
  assert.equal(dirty.ok, true, 'a failing stage is not a token regression');
  const row = dirty.rows.find((r) => r.metric === 'check_stop_tokens');
  assert.match(row.skipped, /stage/i, 'the reason names the stage outcome that made it incomparable');
  assert.equal(row.regressed, false);

  // The other half, which is what stops this being an accommodation: on a green capture the
  // metric still grades, with the same tolerance and the same finding.
  const risen = compare(green, { ...green, check_stop_tokens: 1888, stop_ok: true });
  assert.equal(risen.ok, false, 'a real rise on a green stage still fails');
  assert.equal(risen.rows.find((r) => r.metric === 'check_stop_tokens').regressed, true);

  // A baseline recorded before this change carries no stage outcome, and must keep grading rather
  // than silently becoming exempt.
  const { stop_ok, ...legacy } = green;
  const old = compare(legacy, { ...legacy, check_stop_tokens: 1888, stop_ok: true });
  assert.equal(old.ok, false, 'an older record without stop_ok is still graded');

  // Every other ratcheted metric is unaffected by the stage outcome.
  const other = compare(green, { ...green, claude_md_tokens: 900, stop_ok: false });
  assert.equal(other.ok, false, 'the skip is scoped to the metric the stage outcome affects');
});

test('baseline: an incomparable toolchain is not a regression', async () => {
  const { compare } = await import('../.aidlc/lib/baseline.mjs');
  const base = { tolerance: 1.10, claude_md_tokens: 100, session_context_tokens: 50, check_stop_tokens: 18, wiki_index_tokens: 80, pack_tokens_p50: 100, errored_controls: [] };
  // Same change, measured on a machine with no ruff: the stage output balloons with
  // "tool not installed" text. That is a fact about the laptop, not about the change.
  const elsewhere = { ...base, check_stop_tokens: 107, errored_controls: ['fmt', 'lint'] };
  const cmp = compare(base, elsewhere);
  assert.equal(cmp.ok, true);
  assert.match(cmp.rows.find((r) => r.metric === 'check_stop_tokens').skipped, /toolchain differs/);

  // With the same toolchain on both sides it grades normally again.
  const sameEnv = compare(base, { ...base, check_stop_tokens: 107 });
  assert.equal(sameEnv.ok, false);
});

// p0-unblock-the-loop B4. runId() only ever creates an id, so with no rotation point the file
// written on the very first invocation stays the run id forever. This repo reached 1,185 rows
// across eight days under one id, which pins every control at `insufficient-data` and leaves
// `ledger audit` — the query that authorises deleting a control — unable to answer.
test('a new session rotates the run id, and HARNESS_RUN_ID still pins it', async () => {
  const { newRun, runId, append, report } = await import('../.aidlc/lib/ledger.mjs');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-run-'));
  const L = { state: root, ledger: path.join(root, 'ledger.jsonl'), runId: path.join(root, 'run-id') };

  const first = newRun(L);
  assert.equal(runId(L), first, 'rows within a session share the run id');
  append({ stage: 'stop', control: 'secrets', verdict: 'pass', ms: 1, findings: 0 }, L);

  const second = newRun(L);
  assert.notEqual(second, first, 'a new session is a new run');
  append({ stage: 'stop', control: 'secrets', verdict: 'pass', ms: 1, findings: 0 }, L);
  assert.equal(report(L).runs, 2, 'two sessions must report as two runs');

  const saved = process.env.HARNESS_RUN_ID;
  try {
    process.env.HARNESS_RUN_ID = 'pinned01';
    assert.equal(newRun(L), 'pinned01', 'CI pins a run across steps');
    assert.equal(runId(L), 'pinned01');
    assert.equal(fs.readFileSync(L.runId, 'utf8').trim(), second, 'a pinned run does not clobber the file');
  } finally {
    if (saved === undefined) delete process.env.HARNESS_RUN_ID; else process.env.HARNESS_RUN_ID = saved;
  }
  fs.rmSync(root, { recursive: true, force: true });
});

// the-ledger-cannot-judge-a-deterrent B1-B5. Asked for the first time with enough evidence to
// answer, the audit said "DELETE budget" — a control that fires the instant a limit is crossed,
// standing at its limit, which had never fired because nobody tried to add an eleventh skill.
// Deleting it would remove the reason the limit was never crossed. Meanwhile arch and
// test_quality, which no stage runs, were told to wait for invocations that cannot arrive.
test('the audit separates a control that did not fire from one that did not run', async () => {
  const { audit, wiredControls, KILL } = await import('../.aidlc/lib/ledger.mjs');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-deterrent-'));
  const L = { state: root, ledger: path.join(root, 'ledger.jsonl'), runId: path.join(root, 'run-id') };
  const rows = [];
  const now = new Date().toISOString();
  const push = (control, verdict, n) => { for (let i = 0; i < n; i++) rows.push({ ts: now, run: 'r', control, verdict, ms: 1, findings: 0 }); };
  push('deterrent', 'pass', 60);                                  // wired, ran, never fired
  push('offstage', 'pass', 3);                                    // no stage, no hook
  push('flaky', 'errored', 30); push('flaky', 'pass', 30);        // 50% errors
  push('useful', 'pass', 40); push('useful', 'fail', 20);         // 33% fire rate
  push('young', 'pass', 5);                                       // wired, not enough evidence
  fs.writeFileSync(L.ledger, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const staged = wiredControls({ stages: { fast: ['deterrent'], stop: ['fast', 'flaky', 'useful'], commit: ['stop', 'young'] } });
  const a = audit(L, { staged });
  const by = Object.fromEntries(a.controls.map((c) => [c.control, c.verdict]));

  assert.equal(by.deterrent, 'never-fired', 'B1: ran often, never fired');
  assert.match(a.controls.find((c) => c.control === 'deterrent').action, /read its why/, 'B1: asks rather than instructs');
  assert.equal(by.offstage, 'unwired', 'B2: nothing runs it');
  assert.equal(by.useful, 'earning-its-place', 'B4');
  assert.equal(by.young, 'insufficient-data', 'B5: not yet, which differs from never');
  assert.equal(by.flaky, 'unreliable');

  // B3: the ledger only asserts what it can justify alone.
  assert.deepEqual(a.deletions, ['flaky'], 'a working deterrent is not a delete candidate');
  assert.deepEqual(a.decide.sort(), ['deterrent', 'offstage'], 'both need a human to read the why:');
  assert.equal(KILL.min_sessions, 50, 'the thresholds were never the problem');
  fs.rmSync(root, { recursive: true, force: true });
});

// A control reached only by a hook is wired. The ledger sees it constantly; it is simply not
// named in [stages], and judging by stages alone condemned the three busiest controls.
test('a control reached by a hook binding is wired, not unwired', async () => {
  const { wiredControls } = await import('../.aidlc/lib/ledger.mjs');
  const wired = wiredControls({ stages: { commit: ['secrets'] } });
  // every-control-fires-or-goes B3/B5: `graph-refresh` is telemetry and is no longer judged;
  // `map-drift` is recorded at Stop and is the hook control in its place.
  for (const c of ['bash-guard', 'write-guard', 'map-drift']) assert.ok(wired.has(c), c);
  assert.ok(wired.has('secrets'));
  assert.ok(!wired.has('arch'));
});

test('ledger audit turns rows into decisions, and refuses a verdict without evidence', async () => {
  const { audit, KILL } = await import('../.aidlc/lib/ledger.mjs');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-audit-'));
  const L = { state: root, ledger: path.join(root, 'ledger.jsonl'), runId: path.join(root, 'run-id') };
  const rows = [];
  const now = new Date().toISOString();
  const push = (control, verdict, n) => { for (let i = 0; i < n; i++) rows.push({ ts: now, run: 'r', control, verdict, ms: 1, findings: 0 }); };
  push('useful', 'pass', 40); push('useful', 'fail', 20);   // 33% fire rate
  push('dead', 'pass', 60);                                  // never fired
  push('flaky', 'errored', 30); push('flaky', 'pass', 30);   // 50% error rate
  push('rare', 'pass', 99); push('rare', 'fail', 1);         // 1% fire rate
  push('young', 'pass', 5);                                  // not enough evidence
  fs.writeFileSync(L.ledger, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const a = audit(L);
  const by = Object.fromEntries(a.controls.map((c) => [c.control, c.verdict]));
  assert.equal(by.useful, 'earning-its-place');
  // Renamed: a zero-fire control may be a deterrent, so the audit asks instead of instructing.
  assert.equal(by.dead, 'never-fired');
  assert.equal(by.flaky, 'unreliable');
  assert.equal(by.rare, 'rarely-fires');
  assert.equal(by.young, 'insufficient-data', 'a verdict without evidence is not a verdict');
  // deletions now holds only what the ledger can justify alone; the rest needs a human.
  assert.deepEqual(a.deletions, ['flaky']);
  assert.deepEqual(a.decide, ['dead']);
  assert.equal(a.ready, false);
  assert.equal(KILL.min_sessions, 50);
  fs.rmSync(root, { recursive: true, force: true });
});




// lean-v2 B9. Before this the ledger recorded that a guard fired and never what it matched, so
// `bash-guard  1554 inv  17.7% fired  keep` was a guess: 275 denials with no way to separate a
// caught mistake from a refusal to write a commit message. Four of the fires in the session that
// added this were false blocks of one rule.
test('the ledger records which rule fired, and a human can call a fire wrong', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const ledger = await import('../.aidlc/lib/ledger.mjs');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-rule-'));
  const state = path.join(root, '.aidlc/state');
  fs.mkdirSync(state, { recursive: true });
  const L = { root, state, ledger: path.join(state, 'ledger.jsonl'), runId: path.join(state, 'run-id') };
  try {
    for (let i = 0; i < 4; i++) ledger.append({ stage: 'pre-bash', control: 'bash-guard', rule: 'release-authorization', verdict: 'fail', ms: 0, findings: 1 }, L);
    ledger.append({ stage: 'pre-bash', control: 'bash-guard', rule: 'rm-root', verdict: 'fail', ms: 0, findings: 1 }, L);
    for (let i = 0; i < 60; i++) ledger.append({ stage: 'pre-bash', control: 'bash-guard', verdict: 'pass', ms: 0, findings: 0 }, L);

    const before = ledger.audit(L).controls.find((c) => c.control === 'bash-guard');
    assert.deepEqual(before.rules.map((r) => [r.rule, r.fired, r.false]), [['release-authorization', 4, 0], ['rm-root', 1, 0]]);
    assert.equal(before.rules.every((r) => !r.noisy), true, 'nothing is noisy until a human says so');

    // Each call marks the most recent unflagged fire, which is the one the human just hit.
    for (let i = 0; i < 3; i++) assert.equal(ledger.flag(L, { rule: 'release-authorization' }), 1);
    assert.equal(ledger.flag(L, { rule: 'never-fired-here' }), 0, 'a rule with no fires cannot be flagged');

    const after = ledger.audit(L);
    const guard = after.controls.find((c) => c.control === 'bash-guard');
    const rule = guard.rules.find((r) => r.rule === 'release-authorization');
    assert.equal(rule.false, 3);
    assert.equal(rule.noisy, true, 'more than half of its fires were called wrong');
    assert.deepEqual(after.noisy, ['bash-guard/release-authorization']);

    // Flagging changes the human's verdict on a fire. It never rewrites what the guard recorded.
    const rows = fs.readFileSync(L.ledger, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(rows.filter((r) => r.rule === 'release-authorization').length, 4);
    assert.equal(rows.every((r) => r.verdict === 'fail' || r.verdict === 'pass'), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// lean-v2 B10. The anti-pattern every source on this names and nothing here caught: an agent
// turning a red bar green by moving the bar. Fowler: "AI frequently increases thresholds rather
// than refactors", and human review "should start from the exceptions AI created".
test('tamper: a raised threshold, a bare suppression and a deleted test are each findings', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const { run } = await import('../.aidlc/checks/tamper.mjs');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tamper-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  const cfg = { layout: { root, artifacts: path.join(root, '.aidlc/artifacts'), state: path.join(root, '.aidlc/state') }, guard: {} };
  try {
    git('init', '-q');
    git('config', 'user.email', 'h@example.invalid');
    git('config', 'user.name', 'H');
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(root, '.eslintrc.json'), '{\n  "max-lines": 200\n}\n');
    fs.writeFileSync(path.join(root, 'tests/test_a.py'), 'def test_a():\n    assert True\n');
    fs.writeFileSync(path.join(root, 'src.py'), 'x = 1\n');
    git('add', '-A');
    execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'base'], { cwd: root, stdio: 'ignore' });

    assert.equal((await run(cfg)).verdict, 'pass', 'a clean tree is not tampering');

    // The bar moves to fit the code.
    fs.writeFileSync(path.join(root, '.eslintrc.json'), '{\n  "max-lines": 500\n}\n');
    // A suppression nobody can question.
    fs.writeFileSync(path.join(root, 'src.py'), 'x = 1  # noqa\n');
    // And the test that was failing simply goes.
    fs.rmSync(path.join(root, 'tests/test_a.py'));

    const result = await run(cfg);
    assert.equal(result.verdict, 'fail');
    const rules = result.findings.map((f) => f.rule).sort();
    assert.deepEqual([...new Set(rules)], ['bare-suppression', 'deleted-test', 'raised-threshold']);
    assert.match(result.findings.find((f) => f.rule === 'raised-threshold').message, /200 to 500/);

    // A suppression with a why is a decision someone can disagree with, not an evasion.
    fs.writeFileSync(path.join(root, 'src.py'), 'x = 1  # noqa  # why: vendored stub, upstream issue 412\n');
    const excused = await run(cfg);
    assert.equal(excused.findings.filter((f) => f.rule === 'bare-suppression').length, 0);

    // And a suppression named inside a string literal is a mention. This rule found its own
    // fixture on its first run against this repository, which is how it earned this line.
    fs.writeFileSync(path.join(root, 'src.py'), 'sample = "x = 1  # noqa"\n');
    const quoted = await run(cfg);
    assert.equal(quoted.findings.filter((f) => f.rule === 'bare-suppression').length, 0,
      'a suppression inside a string is a mention, not a suppression');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// every-control-fires-or-goes B1. A control that never fired in production is a deterrent or a
// corpse, and the ledger cannot tell which. `[deterrents]` in harness.toml names the test that
// plants the defect the control's why: describes; the audit checks the file exists and names the
// control, and only then says `deterrent`. A missing or silent file leaves `never-fired` standing.
test('a never-fired control with a named, existing proof test reads deterrent; without one, never-fired', async () => {
  const { audit } = await import('../.aidlc/lib/ledger.mjs');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-deterrent-proof-'));
  const L = { state: root, ledger: path.join(root, 'ledger.jsonl'), runId: path.join(root, 'run-id') };
  const now = new Date().toISOString();
  const rows = [];
  for (const control of ['budget', 'arch', 'ghost']) for (let i = 0; i < 60; i++) rows.push({ ts: now, run: 'r', control, verdict: 'pass', ms: 1, findings: 0 });
  fs.writeFileSync(L.ledger, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.mkdirSync(path.join(root, 'test'));
  fs.writeFileSync(path.join(root, 'test/budget.test.mjs'), "test('budget refuses an eighth skill', () => {});\n");
  fs.writeFileSync(path.join(root, 'test/silent.test.mjs'), "test('says nothing about the control', () => {});\n");

  const staged = new Set(['budget', 'arch', 'ghost']);
  const a = audit(L, { staged, root, deterrents: { budget: 'test/budget.test.mjs', arch: 'test/silent.test.mjs', ghost: 'test/missing.test.mjs' } });
  const by = Object.fromEntries(a.controls.map((c) => [c.control, c]));
  assert.equal(by.budget.verdict, 'deterrent');
  assert.match(by.budget.action, /keep — proven by test\/budget\.test\.mjs/);
  assert.equal(by.arch.verdict, 'never-fired', 'a proof file that never names the control proves nothing');
  assert.equal(by.ghost.verdict, 'never-fired', 'a proof file that does not exist proves nothing');
  assert.deepEqual(a.decide.sort(), ['arch', 'ghost']);
  assert.match(a.warnings.join('\n'), /arch.*silent\.test\.mjs/);
  assert.match(a.warnings.join('\n'), /ghost.*missing\.test\.mjs/);
  fs.rmSync(root, { recursive: true, force: true });
});

// B3 and B4. `graph-refresh` is telemetry — it has no defect to fire on, so it is not judged.
// A name no stage, hook or deterrent entry reaches, whose last row is older than seven days, is
// retired: listed once on a trailing line, never asked about again. The same name with a row
// today is `unwired`, because something is still recording it.
test('telemetry is not classified, and a control nothing reaches ages out as retired', async () => {
  const { audit, wiredControls } = await import('../.aidlc/lib/ledger.mjs');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-retired-'));
  const L = { state: root, ledger: path.join(root, 'ledger.jsonl'), runId: path.join(root, 'run-id') };
  const now = Date.now();
  const at = (daysAgo) => new Date(now - daysAgo * 864e5).toISOString();
  const rows = [];
  for (let i = 0; i < 60; i++) rows.push({ ts: at(1), run: 'r', control: 'graph-refresh', verdict: 'pass', ms: 1, findings: 0 });
  for (let i = 0; i < 20; i++) rows.push({ ts: at(8), run: 'r', control: 'plan-drift', verdict: 'fail', ms: 1, findings: 1 });
  rows.push({ ts: at(9), run: 'r', control: 'hook:pre-bash', verdict: 'pass', ms: 0, findings: 0 });
  for (let i = 0; i < 3; i++) rows.push({ ts: at(0), run: 'r', control: 'offstage', verdict: 'pass', ms: 1, findings: 0 });
  for (let i = 0; i < 60; i++) rows.push({ ts: at(0), run: 'r', control: 'map-drift', verdict: i % 2 ? 'fail' : 'pass', rule: i % 2 ? 'stale-map' : null, ms: 1, findings: i % 2 });
  fs.writeFileSync(L.ledger, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const staged = wiredControls({ stages: { commit: ['secrets'] } });
  assert.ok(staged.has('map-drift'), 'B5: map-drift is recorded at Stop, so it is a hook control');
  const a = audit(L, { staged, root });
  const names = a.controls.map((c) => c.control);
  assert.ok(!names.includes('graph-refresh'), 'B3: telemetry is not judged');
  assert.ok(!names.includes('plan-drift') && !names.includes('hook:pre-bash'), 'B4: stale, unreachable names are not in the table');
  assert.deepEqual(a.retired.sort(), ['hook:pre-bash', 'plan-drift']);
  assert.equal(a.controls.find((c) => c.control === 'offstage').verdict, 'unwired', 'a row today keeps the question open');
  assert.equal(a.controls.find((c) => c.control === 'map-drift').verdict, 'earning-its-place');
  assert.deepEqual(a.decide, ['offstage']);
  fs.rmSync(root, { recursive: true, force: true });
});

// B2, test_quality: the sensor's why: is a test directory that executes nothing. Plant it.
test('test-presence fails a directory with no test(...) text', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-tq-'));
  fs.mkdirSync(path.join(root, 'test'));
  fs.writeFileSync(path.join(root, 'test/empty.test.mjs'), '// a file named like a test that asserts nothing\n');
  const sensor = new URL('../.aidlc/sensors/test-quality.mjs', import.meta.url).pathname;
  const planted = spawnSync(process.execPath, [sensor], { cwd: root, encoding: 'utf8' });
  assert.notEqual(planted.status, 0, 'a test directory that executes nothing must be red');
  assert.match(planted.stderr, /test-presence: no/);
  fs.writeFileSync(path.join(root, 'test/real.test.mjs'), "import { test } from 'node:test';\ntest('x', () => {});\n");
  assert.equal(spawnSync(process.execPath, [sensor], { cwd: root, encoding: 'utf8' }).status, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

// close-the-harness B5. Three golden tasks start an intent and expect files; the intent skill
// interviews first, as it should when a person is there. The one task that says it has
// everything passes, so the three say it too.
test('the three interview tasks tell the agent it has everything and must not ask', async () => {
  const fs = await import('node:fs');
  const tasks = JSON.parse(fs.readFileSync(new URL('../evals/tasks.json', import.meta.url), 'utf8')).tasks;
  for (const id of ['contract-is-testable', 'contract-names-owned-files', 'no-secret-commit']) {
    const t = tasks.find((x) => x.id === id);
    assert.match(t.prompt, /do not ask questions/i, id);
  }
});
