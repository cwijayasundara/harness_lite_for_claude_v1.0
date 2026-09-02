// Zero dependencies, runs on a cold clone: node --test test
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  // A broken sensor blocks nothing — but it is on the record.
  assert.equal(r.ok, true);
  const rows = fs.readFileSync(cfg.layout.ledger, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rows[0].verdict, 'errored');
  fs.rmSync(root, { recursive: true, force: true });
});

test('runner: an explicit secrets command overrides the built-in fallback', async () => {
  const { check } = await import('../.aidlc/lib/runner.mjs');
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-secrets-'));
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
        state, graph: path.join(state, 'graph.json'), ledger: path.join(state, 'ledger.jsonl'), runId: path.join(state, 'run-id') },
    };
    const b = await capture(cfg);
    for (const k of RATCHETED) assert.equal(typeof b[k], 'number', `${k} was not captured`);
    assert.ok(b.graph_modules > 0);
    // Model-side cost is never fabricated here; the eval suite fills it or it stays null.
    assert.equal(b.model, null);
  } finally { s.cleanup(); }
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
  assert.equal(by.dead, 'candidate-for-deletion');
  assert.equal(by.flaky, 'unreliable');
  assert.equal(by.rare, 'rarely-fires');
  assert.equal(by.young, 'insufficient-data', 'a verdict without evidence is not a verdict');
  assert.deepEqual(a.deletions.sort(), ['dead', 'flaky']);
  assert.equal(a.ready, false);
  assert.equal(KILL.min_sessions, 50);
  fs.rmSync(root, { recursive: true, force: true });
});



test('incident loop requires a timestamp and the same-slug intent', async () => {
  const { incidents } = await import('../.aidlc/lib/incidents.mjs');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-incident-'));
  const L = { root, incident: path.join(root, '.aidlc/artifacts/incident'), intent: path.join(root, '.aidlc/artifacts/intent') };
  fs.mkdirSync(L.incident, { recursive: true }); fs.mkdirSync(L.intent, { recursive: true });
  fs.writeFileSync(path.join(L.incident, 'outage.md'), '- **Detected at:** 2026-01-01T00:00:00.000Z\n- **Status:** open\n');
  const [row] = incidents({ layout: L, sla: { incident_to_intent_minutes: 60 } }, Date.parse('2026-01-01T02:00:00.000Z'));
  assert.equal(row.valid, false);
  assert.equal(row.sla, 'breached');
  assert.match(row.issues.join('\n'), /linked intent is missing/);
  fs.rmSync(root, { recursive: true, force: true });
});

