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
  for (const c of ['bash-guard', 'write-guard', 'graph-refresh']) assert.ok(wired.has(c), c);
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
