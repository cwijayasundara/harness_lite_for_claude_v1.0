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
import { evaluate, KNOWN, toRegExp, verifyLedger, verifyService, verifyReporting, ledgerDescriptionExplainsPaidRule } from './lib/assertions.mjs';
import { readdirSync as _rd, statSync as _st } from 'node:fs';
import { stage, stageProduct } from './lib/stage.mjs';
import { runProductCampaign } from './lib/campaign.mjs';
import { parse } from '../.aidlc/lib/artifacts.mjs';
import { approvalDriver } from './lib/approvals.mjs';
import { loadConfig } from '../.aidlc/lib/config.mjs';
import { layout } from '../.aidlc/lib/paths.mjs';
import { requireSubscription } from '../.aidlc/lib/claude-auth.mjs';

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
  // G23. `maxTurns` is an eval budget, and it needs to be one. `subscriptionArgs` puts
  // `--max-turns 30` on any subscription call that did not set one — a sane default for an
  // interactive turn, and not a considered budget for a task that writes an artifact chain and
  // runs a stage. MEASURED on 2026-09-13: five of twenty-two golden tasks stopped at exactly 31
  // turns and were recorded `ungraded: max_turns`, which is a measurement that did not happen
  // wearing the shape of one that did. The real bound on a task is its `budgetUsd`; the turn cap
  // exists to stop a runaway, not to end the work.
  return raw.tasks.map((t) => ({ timeoutMs: d.timeoutMs, budgetUsd: d.budgetUsd, repeats: d.repeats ?? 1, maxTurns: d.maxTurns ?? null, gates: d.gates ?? null, ...t }));
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
  if (t.product) return t.steps.reduce((n,s)=>n+2+Number(!!s.characterize)+Number(!!s.reject)+Number(!!s.stale)+2*Number(!!s.reviewSeed)+2,0);
  if (t.steps?.length) return t.steps.filter((s) => s.prompt).length;
  return t.prompt ? 1 : 0;
}

export function claudeAuthenticated(env = process.env, run = spawnSync, {product=false}={}) {
  try { requireSubscription({ env, run, product }); return true; }
  catch { return false; }
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
    if (t.product) {
      if (!['ledger','service','reporting'].includes(t.product)) problems.push(`${at}: unknown product`);
      if (!t.steps?.length) problems.push(`${at}: product steps are empty`);
      for (const step of t.steps ?? []) {
        if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(step.slug ?? '') || !step.request || !step.behaviours?.length || !step.files?.length || !(step.level > 0)) problems.push(`${at}: invalid product step`);
        if ((step.files ?? []).some(f => typeof f !== 'string' || path.isAbsolute(f) || f.split('/').includes('..'))) problems.push(`${at}: unsafe product file scope`);
      }
    } else if (t.steps) {
      if (!t.steps.length) problems.push(`${at}: steps is empty`);
      t.steps.forEach((s, i) => {
        if (!s.prompt && !s.gate) problems.push(`${at} step ${i}: must contain a prompt or gate decision`);
        if (s.gate && (!['spec', 'plan'].includes(s.gate.kind) || !['approve', 'reject'].includes(s.gate.decision) || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(s.gate.slug ?? ''))) problems.push(`${at} step ${i}: invalid gate decision`);
      });
    } else if (!t.prompt) {
      problems.push(`${at}: no prompt`);
    }
    if (!(t.budgetUsd > 0)) problems.push(`${at}: no USD ceiling — an unbounded task is not a task`);
    if (!(t.timeoutMs > 0)) problems.push(`${at}: no timeout`);
    if (!existsSync(path.join(fixturesDir, t.fixture ?? ''))) problems.push(`${at}: no fixture "${t.fixture}"`);
    const asserts = assertsOf(t);
    if (!t.product && !asserts.length) problems.push(`${at}: no assertions`);
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
// Per-step and per-run caps on what a failing run's results file keeps. Five steps at the
// per-step cap fit inside the run cap, so no step's ending is lost to another's length.
export const STEP_TRANSCRIPT_CAP = 4000;
export const TRANSCRIPT_CAP = 20000;

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
    // `latencyMs` travels with the stalled case too, and that is the case it exists for: a task
    // the timeout killed reports no cost and no tokens, so the only fact a run leaves behind is
    // how long it was allowed to take. Without it, "raise the timeout" is a guess.
    if (stalled) return { assertions: [], usage: out.usage ?? {}, timedOut: !!out.timedOut, latencyMs: out.latencyMs ?? null, transcript: '', incomplete: stalled };
    const ctx = { work: s.work, pristine: s.pristine, transcript: out.transcript ?? '', harness: harnessBin, usage: out.usage ?? {}, baseline: baseline[t.id] };
    return { assertions: evaluate(ctx, t.assert), usage: out.usage ?? {}, timedOut: !!out.timedOut, latencyMs: out.latencyMs ?? null, transcript: out.transcript ?? '', incomplete: null };
  }

  const approvals = approvalDriver(loadConfig(s.work));
  const assertions = [];
  let usage = {};
  let timedOut = false;
  let transcript = '';
  let incomplete = null;
  // A stepped task's latency is the sum of its steps: one number to compare against one timeout,
  // which is what the timeout actually bounds.
  let latencyMs = 0;
  // The working copy as it stood before each step, so a step's assertions can read the diff the
  // step itself made rather than everything since the fixture (`diff_owned_by_current_change`).
  const previous = path.join(s.root, 'previous');
  try {
    for (let idx = 0; idx < t.steps.length; idx++) {
      const step = t.steps[idx];
      if (step.gate) { approvals.decide(step.gate); continue; }
      if (step.implement) approvals.assertImplementation(step.implement);
      rmSync(previous, { recursive: true, force: true });
      cpSync(s.work, previous, { recursive: true, filter: source => path.basename(source) !== '.git' });
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
      latencyMs += out.latencyMs ?? 0;
      // A step that ran out of budget stops the task, and the task is ungraded rather than failed.
      const stalled = out.incomplete ?? ungradable(out);
      if (stalled) { incomplete = { ...stalled, step: idx }; break; }
      // one-integration-test, from F29: the stored transcript kept the first 20,000 characters of
      // the whole campaign, which is the sprint that passed. Each step keeps its own tail, so the
      // step that failed is the one a reader can see the end of.
      transcript = [transcript, `--- step ${idx + 1} ---\n${String(out.transcript ?? '').slice(-STEP_TRANSCRIPT_CAP)}`].filter(Boolean).join('\n');
      const ctx = { work: s.work, pristine: s.pristine, previous, transcript: out.transcript ?? '', harness: harnessBin, usage: out.usage ?? {}, baseline: baseline[t.id] };
      const stepAsserts = evaluate(ctx, step.assert ?? []);
      assertions.push(...stepAsserts);
      if (stepAsserts.some((a) => !a.pass)) break;
    }
  } catch (error) {
    error.approvals = approvals.events();
    error.usage = usage;
    error.transcript = transcript;
    throw error;
  }
  if (!incomplete && t.assert?.length) {
    assertions.push(...evaluate({
      work: s.work, pristine: s.pristine, transcript, harness: harnessBin, usage, baseline: baseline[t.id],
    }, t.assert));
  }
  return { assertions, usage, timedOut, transcript, incomplete, latencyMs, approvals: approvals.events() };
}

export async function runSuite({ tasks, invoke, fixturesDir, harnessBin, baseline = {}, log = () => {}, maxSuiteUsd = Infinity, evidenceRoot = path.join(PLUGIN_ROOT, '.aidlc/evals/products'), evaluatorModel = null, concurrency = 1 }) {
  if (!(maxSuiteUsd > 0)) throw new Error('max-suite-usd must be positive');
  let remaining = maxSuiteUsd;
  // Reserve before the call, settle after. Deducting only after a call returns was safe while the
  // suite ran one task at a time; with several in flight, each would see the same `remaining` and
  // the suite could overspend by up to the concurrency. Reserving first bounds the overrun to
  // zero, and the settle gives back whatever the call did not use.
  const boundedInvoke = async args => {
    if (remaining <= 0) return { incomplete: { reason: 'suite_budget_exhausted' }, usage: {usd:0}, transcript: '' };
    const allowance = Math.min(args.budgetUsd, remaining);
    remaining = Math.max(0, remaining - allowance);
    let out;
    try { out = await invoke({ ...args, budgetUsd: allowance }); }
    catch (error) { throw error; }   // the reservation stands: a throw may still have spent
    const reported = out.usage?.usd;
    // Give back only what a reported cost says was unused. The CLI omitting billing keeps the
    // whole reservation — never treat missing usage as free.
    if (Number.isFinite(reported) && reported >= 0) remaining += Math.max(0, allowance - reported);
    return out;
  };
  const runTask = async (t) => {
    const runs = [];
    for (let i = 0; i < (t.repeats ?? 1); i++) {
      const s = stage(fixturesDir, t.fixture, {product:!!t.product, gates:t.gates ?? null});
      const trialDir = t.product ? path.join(evidenceRoot, `${new Date().toISOString().replace(/[:.]/g,'-')}-${t.id}-${i+1}`) : null;
      if(t.product) stageProduct(s,PLUGIN_ROOT);
      try {
        const out = t.product ? await runProductCampaign({task:t,invoke:boundedInvoke,productTree:s,harnessBin,evaluatorModel,evidenceDir:trialDir,log,
          evaluateProduct:async (productTree,step)=> {
            // G03. `retrieval-app` declares `product: "reporting"` and there was no branch for it
            // here, so it fell through to the SERVICE verifier — a trial graded by assertions
            // about a different product. The comparison path already dispatched all three; this
            // one dispatched two and silently mis-graded the third.
            const checked=t.product==='reporting'?verifyReporting(productTree,step.level)
              :t.product==='ledger'?verifyLedger(productTree,step.level):verifyService(productTree,step.level);
            if(t.product==='ledger' && step.level===4) {
              if(!existsSync(path.join(productTree.work,'src/store.mjs')))throw new Error('storage extraction is missing');
            }
            if(t.product==='ledger' && step.level===5) {
              const doc=readFileSync(path.join(productTree.work,'docs/PRODUCT.md'),'utf8');
              if(!/partial|payment/i.test(doc)||!ledgerDescriptionExplainsPaidRule(doc))throw new Error('current product description misses payment or paid-invoice behaviour');
              if(/overdue[^\n]*regardless of[^\n]*pa(id|yment)/i.test(doc))throw new Error('product description states superseded overdue rule');
              if(existsSync(path.join(productTree.work,'src/store.mjs')))throw new Error('external rename was incorrectly undone');
            }
            return checked;
          }}) : await runAttempt(t, boundedInvoke, s, harnessBin, baseline);
        // An ungraded run is not a passing run, and an empty assertion list is not a pass
        // either — "An empty suite is not a pass" (6496934) applies to a single attempt too.
        const pass = !out.incomplete && out.assertions.length > 0 && out.assertions.every((a) => a.pass);
        runs.push({
          ...(t.product ? {evidence:trialDir,completedSteps:out.completedSteps,totalSteps:out.totalSteps,calibration:!!t.calibration,billingComplete:out.billingComplete,candidateRevision:out.candidateRevision,phases:out.phases} : {}),
          attempt: i + 1, pass, incomplete: out.incomplete ?? null, assertions: out.assertions,
          usage: out.usage ?? {}, timedOut: !!out.timedOut, latencyMs: out.latencyMs ?? null, approvals: out.approvals ?? [],
          // Without the transcript, a failure can only be triaged by paying for the task again.
          // Kept for failures only, and capped, so the results file stays readable.
          // The tail, not the head: the end of a run is where it says why it stopped (F29).
          transcript: pass ? undefined : String(out.transcript ?? '').slice(-TRANSCRIPT_CAP),
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
          ...(t.product ? {evidence:trialDir,incomplete:{reason:'driver_error',detail:e.message}} : {}),
          attempt: i + 1, pass: false, assertions: [{ name: 'harness', pass: false, detail: e.message }], usage: e.usage ?? {}, approvals: e.approvals ?? [], transcript: String(e.transcript ?? '').slice(-TRANSCRIPT_CAP),
          unattended: unattendedApprovals(s.work),
        });
      } finally { if (!s.cleaned) s.cleanup(); }
      const last = runs.at(-1);
      log(`  ${t.id} [${i + 1}/${t.repeats ?? 1}] ${last.pass ? 'pass' : last.incomplete ? `INCONCLUSIVE (${last.incomplete.reason})` : 'FAIL'}`);
    }
    const passed = runs.filter((r) => r.pass).length;
    const ungraded = runs.filter((r) => r.incomplete).length;
    return {
      id: t.id, fixture: t.fixture, repeats: runs.length, passed,
      // A 2-of-3 is a different finding from a 3-of-3 and must never be rounded to "green".
      // A run nobody could grade is a third thing again: not green, and not the model's fault.
      verdict: ungraded === runs.length ? 'inconclusive'
        : passed === runs.length ? 'pass' : passed === 0 ? 'fail' : 'flaky',
      usd: t.product && runs.some(r=>r.billingComplete===false) ? null : runs.reduce((n, r) => n + (r.usage.usd ?? 0), 0),
      ...(t.product?{reportedUsd:runs.reduce((n,r)=>n+(r.usage.reportedUsd??r.usage.usd??0),0),billingComplete:runs.every(r=>r.billingComplete!==false)}:{}),
      unattended: [...new Set(runs.flatMap((r) => r.unattended ?? []))],
      runs,
    };
  };

  // A bounded pool. Tasks are independent — each stages its own fixture in its own temp tree and
  // claims its own port — so the only shared thing is the suite budget, which the reservation
  // above makes safe. Results keep task order however the runs finish, because a results file
  // whose order depends on which task happened to be slow is a file nobody can diff.
  //
  // This was inert when first written: `claudeInvoker` used `spawnSync`, which blocks the whole
  // Node process for the length of a model call, so four lanes awaited one at a time and a
  // 22-task run took the same ~7 minutes per task it took sequentially. The invoker spawns
  // asynchronously now, and `test/invoker.test.mjs` measures the overlap rather than assuming it —
  // nothing measured it the first time, which is exactly why the mistake shipped.
  const results = new Array(tasks.length);
  const lanes = Math.max(1, Math.min(Number(concurrency) || 1, 8));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(lanes, tasks.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= tasks.length) return;
      results[index] = await runTask(tasks[index]);
    }
  }));

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
  if(results.some(r=>r.billingComplete===false)){summary.reportedUsd=results.reduce((n,r)=>n+(r.reportedUsd??r.usd??0),0);summary.usd=null;summary.billingComplete=false;}
  return { summary, results };
}

// The one line a run's summary is judged by. Pulled out so the abort count beside the cost is
// unit-testable without spawning `claude` — B5's whole point is that this line is read on its own.
export function summaryLine(summary) {
  return `${summary.pass} pass · ${summary.flaky} flaky · ${summary.fail} fail · ${summary.inconclusive} inconclusive · ${summary.aborted} aborted · ${summary.usd===null?`cost unknown (reported $${summary.reportedUsd})`:`$${summary.usd}`}`;
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
  const fixturesDir = path.join(HERE, 'fixtures');
  const prune=argv.includes('--prune');
  const comparisons=argv.includes('--compare')||prune;
  if(argv.includes('--comparison')){
    if(!argv.includes('--compare'))throw new Error('--comparison requires --compare');
    if(!['native','graph','generation','retrieval'].includes(flag('comparison')))throw new Error('--comparison requires native, graph, generation or retrieval');
  }
  if(flag('prune-arm') && !prune)throw new Error('--prune-arm requires --prune');
  const products=argv.includes('--products')||comparisons;
  if(comparisons && flag('through'))throw new Error('--compare calibrates first changes itself; --through would truncate paired campaigns');
  let tasks = loadTasks(products ? path.join(HERE,'products.json') : undefined);
  if(products && flag('through')) tasks=tasks.map(t=>({...t,calibration:true,steps:t.steps.slice(0,Number(flag('through')))}));
  // G23. A comma-separated list, so diagnosing the failing half of the baseline is one run with
  // one ledger entry and one results file rather than ten of each.
  if (flag('id')) {
    const wanted = String(flag('id')).split(',').map((s) => s.trim()).filter(Boolean);
    const unknown = wanted.filter((id) => !tasks.some((t) => t.id === id));
    if (unknown.length) throw new Error(`no such task: ${unknown.join(', ')}`);
    tasks = tasks.filter((t) => wanted.includes(t.id));
  }
  // Calibration and triage: override repeats without editing tasks.json.
  if (flag('repeats')) tasks = tasks.map((t) => ({ ...t, repeats: Number(flag('repeats')) }));
  // The timeout is an instrument, not a control: a task it kills produces no verdict at all. When
  // a run comes back full of `timed_out`, the question is how long the work actually takes, and
  // that cannot be answered by the setting that truncated it. Raise it to measure, then set the
  // default in tasks.json from what was measured.
  if (flag('timeout-ms')) {
    const ms = Number(flag('timeout-ms'));
    if (!(ms > 0)) { console.error('--timeout-ms must be positive'); return 2; }
    tasks = tasks.map((t) => ({ ...t, timeoutMs: ms }));
  }
  if (!tasks.length) { console.error('no tasks matched'); return 2; }

  if (!(Number(flag('max-suite-usd', Infinity)) > 0)) { console.error('--max-suite-usd must be positive'); return 2; }
  const problems = validate(tasks, fixturesDir);
  if (problems.length) { console.error('tasks.json is invalid:\n  ' + problems.join('\n  ')); return 2; }
  if (argv.includes('--dry') && comparisons) {
    const {comparisonPairs}=await import('./lib/comparison.mjs');
    const pairs=comparisonPairs(loadConfig(PLUGIN_ROOT).models,{prune,pruneArm:flag('prune-arm'),pair:flag('comparison')}), repeats=Number(flag('repeats',prune?1:3)), budget=Number(flag('max-suite-usd',prune?9:40)),minutes=Number(flag('max-suite-minutes',prune?40:30));
    if(!Number.isInteger(repeats)||repeats<1||!Number.isFinite(budget)||budget<=0||!Number.isFinite(minutes)||minutes<=0)throw new Error('comparison repeats must be a positive integer and budget/time limits finite and positive');
    console.log(JSON.stringify({pairs,products:tasks.map(t=>t.id),smokes:pairs.reduce((n,p)=>n+p.arms.length,0)*tasks.length,pairedAttempts:pairs.reduce((n,p)=>n+p.arms.length,0)*tasks.length*repeats,maxUsd:budget,maxMinutes:minutes},null,2));return 0;
  }
  if (argv.includes('--dry')) {
    const ceiling = tasks.reduce((n, t) => n + t.budgetUsd * t.repeats * promptCount(t), 0);
    console.log(`${tasks.length} tasks valid; ${Math.min(ceiling,Number(flag('max-suite-usd',products?20:Infinity))).toFixed(2)} USD ceiling if run`);
    return 0;
  }

  if (!argv.includes('--live')) {
    console.error('No model calls made. Live subscription trials require --live; use --dry for offline validation.');
    return 2;
  }
  const authentication = requireSubscription({ product: products, cwd: PLUGIN_ROOT });
  console.log(`authentication: ${authentication}; API billing disabled; repository .env not loaded`);

  // G20. The boundary a live product trial will run in, resolved once and printed before anything
  // is spent. `--boundary local` is the operator accepting the CLI permission boundary on a
  // fixture whose code they wrote; `--sandbox` is accepted as the spelling the plan used. A run
  // that asks for nothing gets nothing: a trial that silently picked a weaker boundary than the
  // operator believed is the failure this exists to prevent.
  const {resolveBoundary, boundaryBanner}=await import('./lib/boundary.mjs');
  const boundary=resolveBoundary({requested: flag('boundary') ?? flag('sandbox')});
  if (products || comparisons) console.log(boundaryBanner(boundary));

  if (comparisons) {
    const {runComparisons}=await import('./lib/comparison.mjs');
    const {claudeInvoker}=await import('./lib/invoker.mjs');
    const models=loadConfig(PLUGIN_ROOT).models;
    // G20. A comparison arm runs a real coding agent against a seeded product — a live product
    // trial, which needs a boundary. With one, the arms run; without one, every attempt is the
    // explicit unmeasured result rather than a throw, because "we could not measure this" is a
    // result and a stack trace is not.
    const available=boundary.ok;
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const evidenceRoot=path.join(PLUGIN_ROOT,'.aidlc/evals/comparisons',prune?`prune-${stamp}`:stamp);
    const out=await runComparisons({tasks,models,prune,pruneArm:flag('prune-arm'),pair:flag('comparison'),root:PLUGIN_ROOT,fixturesDir,evidenceRoot,available,shouldStop:()=>!!flag('stop-file')&&existsSync(flag('stop-file')),
      maxUsd:Number(flag('max-suite-usd',prune?9:40)),maxMinutes:Number(flag('max-suite-minutes',prune?40:30)),repetitions:Number(flag('repeats',prune?1:3)),
      invokeFactory:config=>args=>claudeInvoker({pluginDir:PLUGIN_ROOT,model:args.phase==='review'?models.evaluator:config.model,native:!!config.native,comparison:true,boundary})(args),
      log:console.log});
    console.log(JSON.stringify({evidenceRoot,summary:out.summary,calibrations:out.calibrations},null,2));
    return out.attempts.every(a=>a.status==='pass')?0:1;
  }

  const { claudeInvoker } = await import('./lib/invoker.mjs');
  const models=loadConfig(PLUGIN_ROOT).models;
  if(products && (!models?.generator || !models?.evaluator))throw new Error('product trials require explicit capable generator and evaluator models');
  // B12. The model the suite drives, from the one registry that names it.
  let evalModel = null;
  try {
    const { loadConfig } = await import('../.aidlc/lib/config.mjs');
    evalModel = loadConfig(PLUGIN_ROOT).models?.evals ?? null;
  } catch { /* no registry: the CLI default is a defensible fallback */ }
  if(products)evalModel=models.generator;
  if (evalModel) console.log(`model: ${evalModel}`);
  const baselineFile = path.join(HERE, 'baseline.json');
  const baseline = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : {};
  const out = await runSuite({
    tasks, fixturesDir, baseline, maxSuiteUsd: Number(flag('max-suite-usd', products?20:Infinity)), evaluatorModel:models.evaluator,
    // MEASURED 2026-09-13: 22 golden tasks took 1h38m for 12 of them, one at a time, because each
    // is a full agent run against a staged fixture. They share nothing but the budget, so they do
    // not have to be sequential. Default 1 — a suite that quietly changed how it runs is a suite
    // whose numbers changed for a reason nobody recorded.
    concurrency: Number(flag('concurrency', flag('j', 1))),
    harnessBin: path.join(PLUGIN_ROOT, '.aidlc', 'bin', 'harness'),
    invoke: args => claudeInvoker({ pluginDir: PLUGIN_ROOT, model: products && args.phase==='review' ? models.evaluator : evalModel, boundary })(args),
    log: (m) => console.log(m),
  });

  // Results are harness output about a repo, not part of the eval suite, so they stay under
  // .aidlc/ where indicators.mjs reads them and where a target repo keeps its own. The
  // suite moved to the repo root; its results did not.
  const dir = path.join(path.dirname(HERE), '.aidlc', 'evals', products?'products':'results');
  if(products){out.kind='product-campaigns';out.calibration=tasks.some(t=>t.calibration);out.models=models;}
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

if (import.meta.url === `file://${process.argv[1]}`) main().then((c) => process.exit(c ?? 0)).catch(error=>{console.error(error.message);process.exitCode=2;});
