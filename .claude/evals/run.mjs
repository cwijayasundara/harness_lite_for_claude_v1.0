#!/usr/bin/env node
// Law 9. The suite that authorises deletion.
//
// Orchestration only — staging, invoking, grading and reporting. The invoker is a parameter,
// so `runSuite` is exercised in the unit suite with a fake and no spend. That seam is the
// reason the numbers this prints can be trusted.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, KNOWN, toRegExp } from './lib/assertions.mjs';
import { readdirSync as _rd, statSync as _st } from 'node:fs';
import { stage } from './lib/stage.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLAUDE_ROOT = path.dirname(HERE);

// What the model actually touched. A failure that reports only "the file is missing" cannot
// distinguish "did nothing" from "wrote it somewhere else", and those need opposite fixes.
function changedFilesIn(work, pristine) {
  const walk = (root, rel = '') => {
    const out = [];
    let entries = [];
    try { entries = _rd(path.join(root, rel), { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (/(^|\/)(\.git|__pycache__|\.pytest_cache|\.ruff_cache|node_modules)(\/|$)/.test(r)) continue;
      if (e.isDirectory()) out.push(...walk(root, r)); else out.push(r);
    }
    return out;
  };
  const a = new Set(walk(pristine));
  const b = walk(work);
  const changed = b.filter((f) => !a.has(f) || _st(path.join(work, f)).mtimeMs > _st(path.join(pristine, f)).mtimeMs);
  return changed.slice(0, 40);
}

export function loadTasks(file = path.join(HERE, 'tasks.json')) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const d = raw.defaults ?? {};
  return raw.tasks.map((t) => ({ timeoutMs: d.timeoutMs, budgetUsd: d.budgetUsd, repeats: d.repeats ?? 1, ...t }));
}

// --dry runs this and nothing else. A task that cannot be validated statically is a task that
// will waste money discovering it is malformed.
const REGEX_ARG = { transcript_matches: 'v', transcript_not_matches: 'v', transcript_order: 'list', file_matches: 'pair', file_not_matches: 'pair' };
function regexesIn(name, arg) {
  const kind = REGEX_ARG[name];
  if (!kind) return [];
  if (kind === 'v') return [arg];
  if (kind === 'list') return arg;
  return [arg[1]];
}

export function validate(tasks, fixturesDir) {
  const problems = [];
  const ids = new Set();
  for (const t of tasks) {
    const at = `task "${t.id}"`;
    if (!t.id) problems.push('a task has no id');
    if (ids.has(t.id)) problems.push(`${at}: duplicate id`);
    ids.add(t.id);
    if (!t.prompt) problems.push(`${at}: no prompt`);
    if (!(t.budgetUsd > 0)) problems.push(`${at}: no USD ceiling — an unbounded task is not a task`);
    if (!(t.timeoutMs > 0)) problems.push(`${at}: no timeout`);
    if (!existsSync(path.join(fixturesDir, t.fixture ?? ''))) problems.push(`${at}: no fixture "${t.fixture}"`);
    if (!t.assert?.length) problems.push(`${at}: no assertions`);
    for (const a of t.assert ?? []) {
      const name = Object.keys(a)[0];
      if (!KNOWN.includes(name)) problems.push(`${at}: unknown assertion "${name}" (known: ${KNOWN.join(', ')})`);
      // A regex that will not compile is a task that fails for the wrong reason at $0.75 a go.
      for (const pat of regexesIn(name, Object.values(a)[0])) {
        try { toRegExp(pat); } catch (e) { problems.push(`${at}: bad regex ${JSON.stringify(pat)} — ${e.message}`); }
      }
    }
  }
  return problems;
}

export async function runSuite({ tasks, invoke, fixturesDir, harnessBin, baseline = {}, log = () => {} }) {
  const results = [];
  for (const t of tasks) {
    const runs = [];
    for (let i = 0; i < (t.repeats ?? 1); i++) {
      const s = stage(fixturesDir, t.fixture);
      let out;
      try {
        out = await invoke({ prompt: t.prompt, cwd: s.work, timeoutMs: t.timeoutMs, budgetUsd: t.budgetUsd, task: t, attempt: i });
        if (out?.notInstalled) throw Object.assign(new Error(out.error), { fatal: true });
        if (/invalid api key|authentication_error|please run .?claude login/i.test(out?.transcript ?? '')) {
          throw Object.assign(new Error('the `claude` CLI is not authenticated'), { fatal: true });
        }
        const ctx = { work: s.work, pristine: s.pristine, transcript: out.transcript ?? '', harness: harnessBin, usage: out.usage ?? {}, baseline: baseline[t.id] };
        const assertions = evaluate(ctx, t.assert);
        runs.push({
          attempt: i + 1, pass: assertions.every((a) => a.pass), assertions,
          usage: out.usage ?? {}, timedOut: !!out.timedOut,
          // Without the transcript, a failure can only be triaged by paying for the task again.
          // Kept for failures only, and capped, so the results file stays readable.
          transcript: assertions.every((a) => a.pass) ? undefined : String(out.transcript ?? '').slice(0, 20000),
          changed: changedFilesIn(s.work, s.pristine),
        });
      } catch (e) {
        if (e.fatal) { s.cleanup(); throw e; }
        runs.push({ attempt: i + 1, pass: false, assertions: [{ name: 'harness', pass: false, detail: e.message }], usage: {} });
      } finally { if (!s.cleaned) s.cleanup(); }
      log(`  ${t.id} [${i + 1}/${t.repeats ?? 1}] ${runs.at(-1).pass ? 'pass' : 'FAIL'}`);
    }
    const passed = runs.filter((r) => r.pass).length;
    results.push({
      id: t.id, fixture: t.fixture, repeats: runs.length, passed,
      // A 2-of-3 is a different finding from a 3-of-3 and must never be rounded to "green".
      verdict: passed === runs.length ? 'pass' : passed === 0 ? 'fail' : 'flaky',
      usd: runs.reduce((n, r) => n + (r.usage.usd ?? 0), 0),
      runs,
    });
  }
  const summary = {
    total: results.length,
    pass: results.filter((r) => r.verdict === 'pass').length,
    flaky: results.filter((r) => r.verdict === 'flaky').length,
    fail: results.filter((r) => r.verdict === 'fail').length,
    usd: Number(results.reduce((n, r) => n + r.usd, 0).toFixed(4)),
  };
  return { summary, results };
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
  const fixturesDir = path.join(HERE, 'fixtures');
  let tasks = loadTasks();
  if (flag('id')) tasks = tasks.filter((t) => t.id === flag('id'));
  // Calibration and triage: override repeats without editing tasks.json.
  if (flag('repeats')) tasks = tasks.map((t) => ({ ...t, repeats: Number(flag('repeats')) }));
  if (!tasks.length) { console.error('no tasks matched'); return 2; }

  const problems = validate(tasks, fixturesDir);
  if (problems.length) { console.error('tasks.json is invalid:\n  ' + problems.join('\n  ')); return 2; }
  if (argv.includes('--dry')) { console.log(`${tasks.length} tasks valid; ${tasks.reduce((n, t) => n + t.budgetUsd * t.repeats, 0).toFixed(2)} USD ceiling if run`); return 0; }

  // `claude -p` authenticates from a Claude Code login as well as from an env var, so keying
  // the gate on ANTHROPIC_API_KEY alone refuses to run on exactly the machines most likely to
  // be able to. Check what actually indicates auth, and let --force cover the rest.
  const credentialsFile = path.join(process.env.HOME ?? '', '.claude', '.credentials.json');
  const authed = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN
    || process.env.ANTHROPIC_AUTH_TOKEN || existsSync(credentialsFile);
  if (!authed && !argv.includes('--force')) {
    if (argv.includes('--require-auth')) {
      console.error('Claude credentials are required for this eval run, but none were found.');
      return 2;
    }
    // Never block a contributor who only wanted `node --test`.
    console.log('No Claude credentials found — skipping the model half of the suite. Tasks validated.');
    console.log('If your `claude` CLI is already logged in, re-run with --force.');
    return 0;
  }

  const { claudeInvoker } = await import('./lib/invoker.mjs');
  const baselineFile = path.join(HERE, 'baseline.json');
  const baseline = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : {};
  const out = await runSuite({
    tasks, fixturesDir, baseline,
    harnessBin: path.join(CLAUDE_ROOT, 'bin', 'harness'),
    invoke: claudeInvoker({ pluginDir: CLAUDE_ROOT }),
    log: (m) => console.log(m),
  });

  const dir = path.join(HERE, 'results');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(path.join(dir, `${stamp}.json`), JSON.stringify(out, null, 2));

  console.log(`\n${out.summary.pass} pass · ${out.summary.flaky} flaky · ${out.summary.fail} fail · $${out.summary.usd}`);
  for (const r of out.results.filter((r) => r.verdict !== 'pass')) {
    console.log(`\n${r.verdict.toUpperCase()}  ${r.id}  (${r.passed}/${r.repeats})`);
    for (const run of r.runs) for (const a of run.assertions.filter((a) => !a.pass)) console.log(`    ${a.name}: ${a.detail}`);
  }
  // Flaky is not green. A suite that rounds 2-of-3 up is a suite that stops detecting drift.
  return out.summary.fail || out.summary.flaky ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) main().then((c) => process.exit(c ?? 0));
