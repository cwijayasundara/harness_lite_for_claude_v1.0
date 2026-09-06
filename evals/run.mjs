#!/usr/bin/env node
// Law 9. The suite that authorises deletion.
//
// Orchestration only — staging, invoking, grading and reporting. The invoker is a parameter,
// so `runSuite` is exercised in the unit suite with a fake and no spend. That seam is the
// reason the numbers this prints can be trusted.

import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, KNOWN, toRegExp } from './lib/assertions.mjs';
import { readdirSync as _rd, statSync as _st } from 'node:fs';
import { stage } from './lib/stage.mjs';
import { parse } from '../.aidlc/lib/artifacts.mjs';
import { layout } from '../.aidlc/lib/paths.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.dirname(HERE);

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

// B7. A mechanism that silently substitutes for a human should be the loudest thing in the log,
// not a detail in a tmpdir about to be deleted. Reads the same frontmatter `approve()` writes —
// `by: unattended-eval-run` — from the staged working copy before it is cleaned up.
function unattendedApprovals(work) {
  // review `1ace6a8` (Nit 1): read the shared `layout()` rather than hard-coding the path, so
  // this stays correct if the artifacts directory is ever computed differently there — the one
  // function `approve()` itself resolves paths through (via `cfg.layout.artifacts`).
  const artifactsDir = layout(work).artifacts;
  if (!existsSync(artifactsDir)) return [];
  const found = [];
  for (const entry of _rd(artifactsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const kind of ['spec', 'plan']) {
      const file = path.join(artifactsDir, entry.name, `${kind}.md`);
      if (!existsSync(file)) continue;
      const { front } = parse(readFileSync(file, 'utf8'));
      if (front.by === 'unattended-eval-run') found.push(`${entry.name}/${kind}.md`);
    }
  }
  return found;
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

export function promptCount(t) {
  if (t.steps?.length) return t.steps.filter((s) => s.prompt).length;
  return t.prompt ? 1 : 0;
}

// Node does not read `.env`. Someone who puts a key there and runs the suite gets "no Claude
// credentials found", which is a true statement about `process.env` and a misleading one about
// what they did — and the next move after a misleading message is usually to paste the key
// somewhere worse. `process.loadEnvFile` is built in (Node 20.12+), so this stays zero-dependency.
//
// The file is gitignored and never read for its value here: this only makes the variable visible
// to the CLI that performs the run. CI passes the same variable from a repository secret and has
// no file at all.
export function loadDotEnv(root, env = process.env) {
  const file = path.join(root, '.env');
  if (!existsSync(file) || typeof process.loadEnvFile !== 'function') return false;
  // An already-set variable wins: an explicit `ANTHROPIC_API_KEY=... node evals/run.mjs` must not
  // be silently overridden by a stale file.
  const had = { ...env };
  try { process.loadEnvFile(file); } catch { return false; }
  for (const [k, v] of Object.entries(had)) if (v !== undefined) process.env[k] = v;
  return true;
}

export function claudeAuthenticated(env = process.env, run = spawnSync) {
  if (env.ANTHROPIC_API_KEY || env.CLAUDE_CODE_OAUTH_TOKEN || env.ANTHROPIC_AUTH_TOKEN) return true;
  const result = run('claude', ['auth', 'status'], { encoding: 'utf8', env });
  if (result.error?.code === 'ENOENT') return false;
  try { return JSON.parse(result.stdout ?? '').loggedIn === true; }
  catch { return result.status === 0 && /logged.?in\s*[:=]?\s*true/i.test(`${result.stdout ?? ''}${result.stderr ?? ''}`); }
}

function assertsOf(t) {
  return [...(t.assert ?? []), ...(t.steps ?? []).flatMap((s) => s.assert ?? [])];
}

function visitAsserts(at, list, problems) {
  for (const a of list) {
    const name = Object.keys(a)[0];
    if (!KNOWN.includes(name)) problems.push(`${at}: unknown assertion "${name}" (known: ${KNOWN.join(', ')})`);
    for (const pat of regexesIn(name, Object.values(a)[0])) {
      try { toRegExp(pat); } catch (e) { problems.push(`${at}: bad regex ${JSON.stringify(pat)} — ${e.message}`); }
    }
  }
}

export function validate(tasks, fixturesDir) {
  const problems = [];
  const ids = new Set();
  for (const t of tasks) {
    const at = `task "${t.id}"`;
    if (!t.id) problems.push('a task has no id');
    if (ids.has(t.id)) problems.push(`${at}: duplicate id`);
    ids.add(t.id);
    if (t.steps) {
      if (!t.steps.length) problems.push(`${at}: steps is empty`);
      t.steps.forEach((s, i) => {
        if (!s.prompt) problems.push(`${at} step ${i}: must contain a prompt`);
      });
    } else if (!t.prompt) {
      problems.push(`${at}: no prompt`);
    }
    if (!(t.budgetUsd > 0)) problems.push(`${at}: no USD ceiling — an unbounded task is not a task`);
    if (!(t.timeoutMs > 0)) problems.push(`${at}: no timeout`);
    if (!existsSync(path.join(fixturesDir, t.fixture ?? ''))) problems.push(`${at}: no fixture "${t.fixture}"`);
    const asserts = assertsOf(t);
    if (!asserts.length) problems.push(`${at}: no assertions`);
    visitAsserts(at, asserts, problems);
  }
  return problems;
}

function invokerFatal(out) {
  if (out?.notInstalled) return Object.assign(new Error(out.error), { fatal: true });
  if (/invalid api key|authentication_error|not logged in|please run (?:\/?login|.?claude login)/i.test(out?.transcript ?? '')) {
    return Object.assign(new Error('the `claude` CLI is not authenticated'), { fatal: true });
  }
  return null;
}

// A run the timeout killed before the model produced anything is ungraded, for the same reason an
// exhausted one is: there is no run to grade. `evidence.md` F27 — `campaign-legacy` spent 900
// seconds producing zero tokens and was recorded `fail` on assertions it never reached, which
// accuses the agent of missing work it was never given the chance to do. A timeout *after* output
// is still graded: partial work is work, and the transcript is there to read.
const ungradable = (out) =>
  out.timedOut && !(out.usage?.output_tokens > 0)
    ? { reason: 'timed_out', detail: 'the timeout fired before the model produced any output' }
    : null;

async function runAttempt(t, invoke, s, harnessBin, baseline) {
  if (!t.steps) {
    const out = await invoke({ prompt: t.prompt, cwd: s.work, timeoutMs: t.timeoutMs, budgetUsd: t.budgetUsd, task: t });
    const fatal = invokerFatal(out);
    if (fatal) throw fatal;
    // A run that never produced model output cannot be graded. Grading it anyway is how budget
    // exhaustion got reported as model failure twice on 2026-09-02.
    const stalled = out.incomplete ?? ungradable(out);
    if (stalled) return { assertions: [], usage: out.usage ?? {}, timedOut: !!out.timedOut, transcript: '', incomplete: stalled };
    const ctx = { work: s.work, pristine: s.pristine, transcript: out.transcript ?? '', harness: harnessBin, usage: out.usage ?? {}, baseline: baseline[t.id] };
    return { assertions: evaluate(ctx, t.assert), usage: out.usage ?? {}, timedOut: !!out.timedOut, transcript: out.transcript ?? '', incomplete: null };
  }

  const assertions = [];
  let usage = {};
  let timedOut = false;
  let transcript = '';
  let incomplete = null;
  // The working copy as it stood before each step, so a step's assertions can read the diff the
  // step itself made rather than everything since the fixture (`diff_owned_by_current_change`).
  const previous = path.join(s.root, 'previous');
  for (let idx = 0; idx < t.steps.length; idx++) {
    const step = t.steps[idx];
    rmSync(previous, { recursive: true, force: true });
    cpSync(s.work, previous, { recursive: true });
    const out = await invoke({
      prompt: step.prompt, cwd: s.work, timeoutMs: t.timeoutMs, budgetUsd: t.budgetUsd, task: t, step: idx,
    });
    const fatal = invokerFatal(out);
    if (fatal) throw fatal;
    usage = {
      usd: (usage.usd ?? 0) + (out.usage?.usd ?? 0),
      output_tokens: (usage.output_tokens ?? 0) + (out.usage?.output_tokens ?? 0),
    };
    timedOut = timedOut || !!out.timedOut;
    // A step that ran out of budget stops the task, and the task is ungraded rather than failed.
    const stalled = out.incomplete ?? ungradable(out);
    if (stalled) { incomplete = { ...stalled, step: idx }; break; }
    transcript = [transcript, out.transcript ?? ''].filter(Boolean).join('\n');
    const ctx = { work: s.work, pristine: s.pristine, previous, transcript: out.transcript ?? '', harness: harnessBin, usage: out.usage ?? {}, baseline: baseline[t.id] };
    const stepAsserts = evaluate(ctx, step.assert ?? []);
    assertions.push(...stepAsserts);
    if (stepAsserts.some((a) => !a.pass)) break;
  }
  if (!incomplete && t.assert?.length) {
    assertions.push(...evaluate({
      work: s.work, pristine: s.pristine, transcript, harness: harnessBin, usage, baseline: baseline[t.id],
    }, t.assert));
  }
  return { assertions, usage, timedOut, transcript, incomplete };
}

export async function runSuite({ tasks, invoke, fixturesDir, harnessBin, baseline = {}, log = () => {} }) {
  const results = [];
  for (const t of tasks) {
    const runs = [];
    for (let i = 0; i < (t.repeats ?? 1); i++) {
      const s = stage(fixturesDir, t.fixture);
      try {
        const out = await runAttempt(t, invoke, s, harnessBin, baseline);
        // An ungraded run is not a passing run, and an empty assertion list is not a pass
        // either — "An empty suite is not a pass" (6496934) applies to a single attempt too.
        const pass = !out.incomplete && out.assertions.length > 0 && out.assertions.every((a) => a.pass);
        runs.push({
          attempt: i + 1, pass, incomplete: out.incomplete ?? null, assertions: out.assertions,
          usage: out.usage ?? {}, timedOut: !!out.timedOut,
          // Without the transcript, a failure can only be triaged by paying for the task again.
          // Kept for failures only, and capped, so the results file stays readable.
          transcript: pass ? undefined : String(out.transcript ?? '').slice(0, 20000),
          changed: changedFilesIn(s.work, s.pristine),
          // B7: read before the working copy is cleaned up below.
          unattended: unattendedApprovals(s.work),
        });
      } catch (e) {
        if (e.fatal) { s.cleanup(); throw e; }
        // review `1ace6a8` (Important 2): a campaign that self-approves in an earlier sprint and
        // then throws in a later one must still report what it approved — read before `finally`
        // deletes the working copy, same as the success path above.
        runs.push({
          attempt: i + 1, pass: false, assertions: [{ name: 'harness', pass: false, detail: e.message }], usage: {},
          unattended: unattendedApprovals(s.work),
        });
      } finally { if (!s.cleaned) s.cleanup(); }
      const last = runs.at(-1);
      log(`  ${t.id} [${i + 1}/${t.repeats ?? 1}] ${last.pass ? 'pass' : last.incomplete ? `INCONCLUSIVE (${last.incomplete.reason})` : 'FAIL'}`);
    }
    const passed = runs.filter((r) => r.pass).length;
    const ungraded = runs.filter((r) => r.incomplete).length;
    results.push({
      id: t.id, fixture: t.fixture, repeats: runs.length, passed,
      // A 2-of-3 is a different finding from a 3-of-3 and must never be rounded to "green".
      // A run nobody could grade is a third thing again: not green, and not the model's fault.
      verdict: ungraded === runs.length ? 'inconclusive'
        : passed === runs.length ? 'pass' : passed === 0 ? 'fail' : 'flaky',
      usd: runs.reduce((n, r) => n + (r.usage.usd ?? 0), 0),
      unattended: [...new Set(runs.flatMap((r) => r.unattended ?? []))],
      runs,
    });
  }
  const summary = {
    total: results.length,
    pass: results.filter((r) => r.verdict === 'pass').length,
    flaky: results.filter((r) => r.verdict === 'flaky').length,
    fail: results.filter((r) => r.verdict === 'fail').length,
    inconclusive: results.filter((r) => r.verdict === 'inconclusive').length,
    // B5 (the-suite-measures-this-harness), F19: a task that burns through its ceiling on one of
    // three repeats but passes the other two lands on `flaky`, not `inconclusive` — the abort is
    // invisible to every count above. This counts the run, not the task's overall verdict, so
    // "the run got cheaper" ($8.37 against a $13.76 baseline) cannot read as good news again
    // while four tasks are exhausting their budget.
    aborted: results.reduce((n, r) => n + r.runs.filter((run) => run.incomplete).length, 0),
    usd: Number(results.reduce((n, r) => n + r.usd, 0).toFixed(4)),
  };
  return { summary, results };
}

// The one line a run's summary is judged by. Pulled out so the abort count beside the cost is
// unit-testable without spawning `claude` — B5's whole point is that this line is read on its own.
export function summaryLine(summary) {
  return `${summary.pass} pass · ${summary.flaky} flaky · ${summary.fail} fail · ${summary.inconclusive} inconclusive · ${summary.aborted} aborted · $${summary.usd}`;
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
  if (argv.includes('--dry')) {
    const ceiling = tasks.reduce((n, t) => n + t.budgetUsd * t.repeats * promptCount(t), 0);
    console.log(`${tasks.length} tasks valid; ${ceiling.toFixed(2)} USD ceiling if run`);
    return 0;
  }

  // Claude may store OAuth credentials in an OS keychain rather than a repository-visible file.
  // Ask the CLI that will perform the run; environment tokens remain the non-interactive CI path.
  const fromFile = loadDotEnv(PLUGIN_ROOT);
  const authed = claudeAuthenticated();
  if (fromFile && authed) console.log('credentials: .env');
  if (!authed && !argv.includes('--force')) {
    if (argv.includes('--require-auth')) {
      console.error('Claude credentials are required for this eval run, but none were found.');
      return 2;
    }
    // Never block a contributor who only wanted `node --test`.
    console.log('No Claude credentials found — skipping the model half of the suite. Tasks validated.');
    console.log('Run `claude auth login`, then confirm `claude auth status` reports "loggedIn": true.');
    return 0;
  }

  const { claudeInvoker } = await import('./lib/invoker.mjs');
  // B12. The model the suite drives, from the one registry that names it.
  let evalModel = null;
  try {
    const { loadConfig } = await import('../.aidlc/lib/config.mjs');
    evalModel = loadConfig(PLUGIN_ROOT).models?.evals ?? null;
  } catch { /* no registry: the CLI default is a defensible fallback */ }
  if (evalModel) console.log(`model: ${evalModel}`);
  const baselineFile = path.join(HERE, 'baseline.json');
  const baseline = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : {};
  const out = await runSuite({
    tasks, fixturesDir, baseline,
    harnessBin: path.join(PLUGIN_ROOT, '.aidlc', 'bin', 'harness'),
    invoke: claudeInvoker({ pluginDir: PLUGIN_ROOT, model: evalModel }),
    log: (m) => console.log(m),
  });

  // Results are harness output about a repo, not part of the eval suite, so they stay under
  // .aidlc/ where indicators.mjs reads them and where a target repo keeps its own. The
  // suite moved to the repo root; its results did not.
  const dir = path.join(path.dirname(HERE), '.aidlc', 'evals', 'results');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(path.join(dir, `${stamp}.json`), JSON.stringify(out, null, 2));

  console.log(`\n${summaryLine(out.summary)}`);
  // B7. A mechanism that substitutes for a human should be the loudest thing in the log, not a
  // detail in a tmpdir that is about to be deleted.
  for (const r of out.results.filter((r) => r.unattended?.length)) {
    console.log(`  UNATTENDED APPROVAL  ${r.id}  ${r.unattended.join(', ')}`);
  }
  for (const r of out.results.filter((r) => r.verdict !== 'pass')) {
    console.log(`\n${r.verdict.toUpperCase()}  ${r.id}  (${r.passed}/${r.repeats})`);
    for (const run of r.runs) {
      if (run.incomplete) console.log(`    ungraded: ${run.incomplete.reason}${run.incomplete.detail ? ` — ${run.incomplete.detail}` : ''}${run.incomplete.turns ? ` after ${run.incomplete.turns} turns` : ''}`);
      for (const a of run.assertions.filter((a) => !a.pass)) console.log(`    ${a.name}: ${a.detail}`);
    }
  }
  // Flaky is not green. A suite that rounds 2-of-3 up is a suite that stops detecting drift.
  // Inconclusive is not green either — it is a question the suite failed to ask.
  return out.summary.fail || out.summary.flaky || out.summary.inconclusive ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) main().then((c) => process.exit(c ?? 0));
