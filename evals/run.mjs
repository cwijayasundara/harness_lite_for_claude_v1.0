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
import { evaluate, KNOWN, toRegExp, verifyLedger, verifyService } from './lib/assertions.mjs';
import { readdirSync as _rd, statSync as _st } from 'node:fs';
import { stage, isolateStage } from './lib/stage.mjs';
import { runProductCampaign } from './lib/campaign.mjs';
import { parse } from '../.aidlc/lib/artifacts.mjs';
import { approvalDriver } from './lib/approvals.mjs';
import { loadConfig } from '../.aidlc/lib/config.mjs';
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
  if (t.product) return t.steps.reduce((n,s)=>n+2+Number(!!s.characterize)+Number(!!s.reject)+Number(!!s.stale)+2*Number(!!s.reviewSeed)+2,0);
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

export function claudeAuthenticated(env = process.env, run = spawnSync, {product=false}={}) {
  if (env.ANTHROPIC_API_KEY || env.CLAUDE_CODE_OAUTH_TOKEN || env.ANTHROPIC_AUTH_TOKEN) return true;
  if(product)return false; // Host keychains are deliberately absent from the container.
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
    if (t.product) {
      if (!['ledger','service'].includes(t.product)) problems.push(`${at}: unknown product`);
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
    if (stalled) return { assertions: [], usage: out.usage ?? {}, timedOut: !!out.timedOut, transcript: '', incomplete: stalled };
    const ctx = { work: s.work, pristine: s.pristine, transcript: out.transcript ?? '', harness: harnessBin, usage: out.usage ?? {}, baseline: baseline[t.id] };
    return { assertions: evaluate(ctx, t.assert), usage: out.usage ?? {}, timedOut: !!out.timedOut, transcript: out.transcript ?? '', incomplete: null };
  }

  const approvals = approvalDriver(loadConfig(s.work));
  const assertions = [];
  let usage = {};
  let timedOut = false;
  let transcript = '';
  let incomplete = null;
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
  return { assertions, usage, timedOut, transcript, incomplete, approvals: approvals.events() };
}

export async function runSuite({ tasks, invoke, fixturesDir, harnessBin, baseline = {}, log = () => {}, maxSuiteUsd = Infinity, evidenceRoot = path.join(PLUGIN_ROOT, '.aidlc/evals/products'), evaluatorModel = null }) {
  if (!(maxSuiteUsd > 0)) throw new Error('max-suite-usd must be positive');
  let remaining = maxSuiteUsd;
  const boundedInvoke = async args => {
    if (remaining <= 0) return { incomplete: { reason: 'suite_budget_exhausted' }, usage: {usd:0}, transcript: '' };
    const allowance = Math.min(args.budgetUsd, remaining);
    let out;
    try { out = await invoke({ ...args, budgetUsd: allowance }); }
    catch(error) { remaining=Math.max(0,remaining-allowance);throw error; }
    const reported = out.usage?.usd;
    // Reserve the whole allowance if the CLI omits billing. Never treat missing usage as free.
    remaining = Math.max(0, remaining - (Number.isFinite(reported) && reported >= 0 ? reported : allowance));
    return out;
  };
  const results = [];
  for (const t of tasks) {
    const runs = [];
    for (let i = 0; i < (t.repeats ?? 1); i++) {
      const s = stage(fixturesDir, t.fixture, {product:!!t.product});
      const trialDir = t.product ? path.join(evidenceRoot, `${new Date().toISOString().replace(/[:.]/g,'-')}-${t.id}-${i+1}`) : null;
      if(t.product) isolateStage(s,PLUGIN_ROOT);
      try {
        const out = t.product ? await runProductCampaign({task:t,invoke:boundedInvoke,sandbox:s,harnessBin,evaluatorModel,evidenceDir:trialDir,log,
          evaluateProduct:async (sandbox,step)=> {
            const checked=t.product==='ledger'?verifyLedger(sandbox,step.level):verifyService(sandbox,step.level);
            if(t.product==='ledger' && step.level===4) {
              if(!existsSync(path.join(sandbox.work,'src/store.mjs')))throw new Error('storage extraction is missing');
            }
            if(t.product==='ledger' && step.level===5) {
              const doc=readFileSync(path.join(sandbox.work,'docs/PRODUCT.md'),'utf8');
              if(!/partial|payment/i.test(doc)||!/paid[^\n]*(not|never)[^\n]*overdue|not overdue[^\n]*paid/i.test(doc))throw new Error('current product description misses payment or paid-invoice behaviour');
              if(/overdue[^\n]*regardless of[^\n]*pa(id|yment)/i.test(doc))throw new Error('product description states superseded overdue rule');
              if(existsSync(path.join(sandbox.work,'src/store.mjs')))throw new Error('external rename was incorrectly undone');
            }
            return checked;
          }}) : await runAttempt(t, boundedInvoke, s, harnessBin, baseline);
        // An ungraded run is not a passing run, and an empty assertion list is not a pass
        // either — "An empty suite is not a pass" (6496934) applies to a single attempt too.
        const pass = !out.incomplete && out.assertions.length > 0 && out.assertions.every((a) => a.pass);
        runs.push({
          ...(t.product ? {evidence:trialDir,completedSteps:out.completedSteps,totalSteps:out.totalSteps,calibration:!!t.calibration,billingComplete:out.billingComplete,candidateRevision:out.candidateRevision,phases:out.phases} : {}),
          attempt: i + 1, pass, incomplete: out.incomplete ?? null, assertions: out.assertions,
          usage: out.usage ?? {}, timedOut: !!out.timedOut, approvals: out.approvals ?? [],
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
    results.push({
      id: t.id, fixture: t.fixture, repeats: runs.length, passed,
      // A 2-of-3 is a different finding from a 3-of-3 and must never be rounded to "green".
      // A run nobody could grade is a third thing again: not green, and not the model's fault.
      verdict: ungraded === runs.length ? 'inconclusive'
        : passed === runs.length ? 'pass' : passed === 0 ? 'fail' : 'flaky',
      usd: t.product && runs.some(r=>r.billingComplete===false) ? null : runs.reduce((n, r) => n + (r.usage.usd ?? 0), 0),
      ...(t.product?{reportedUsd:runs.reduce((n,r)=>n+(r.usage.reportedUsd??r.usage.usd??0),0),billingComplete:runs.every(r=>r.billingComplete!==false)}:{}),
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
  const comparisons=argv.includes('--compare');
  const products=argv.includes('--products')||comparisons;
  let tasks = loadTasks(products ? path.join(HERE,'products.json') : undefined);
  if(products && flag('through')) tasks=tasks.map(t=>({...t,calibration:true,steps:t.steps.slice(0,Number(flag('through')))}));
  if (flag('id')) tasks = tasks.filter((t) => t.id === flag('id'));
  // Calibration and triage: override repeats without editing tasks.json.
  if (flag('repeats')) tasks = tasks.map((t) => ({ ...t, repeats: Number(flag('repeats')) }));
  if (!tasks.length) { console.error('no tasks matched'); return 2; }

  if (!(Number(flag('max-suite-usd', Infinity)) > 0)) { console.error('--max-suite-usd must be positive'); return 2; }
  const problems = validate(tasks, fixturesDir);
  if (problems.length) { console.error('tasks.json is invalid:\n  ' + problems.join('\n  ')); return 2; }
  if (argv.includes('--dry')) {
    const ceiling = tasks.reduce((n, t) => n + t.budgetUsd * t.repeats * promptCount(t), 0);
    console.log(`${tasks.length} tasks valid; ${Math.min(ceiling,Number(flag('max-suite-usd',products?20:Infinity))).toFixed(2)} USD ceiling if run`);
    return 0;
  }

  if (comparisons) {
    const {runComparisons}=await import('./lib/comparison.mjs');
    const {claudeInvoker}=await import('./lib/invoker.mjs');
    loadDotEnv(PLUGIN_ROOT);
    const models=loadConfig(PLUGIN_ROOT).models;
    const available=claudeAuthenticated(process.env,spawnSync,{product:true})&&spawnSync('docker',['info'],{stdio:'ignore',timeout:15000}).status===0;
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const evidenceRoot=path.join(PLUGIN_ROOT,'.aidlc/evals/comparisons',stamp);
    const out=await runComparisons({tasks,models,root:PLUGIN_ROOT,fixturesDir,evidenceRoot,available,
      maxUsd:Number(flag('max-suite-usd',40)),repetitions:Number(flag('repeats',3)),
      invokeFactory:config=>args=>claudeInvoker({pluginDir:PLUGIN_ROOT,model:args.phase==='review'?models.evaluator:config.model,native:!!config.native,comparison:true})(args),
      log:console.log});
    console.log(JSON.stringify({evidenceRoot,summary:out.summary,calibrations:out.calibrations},null,2));
    return out.attempts.every(a=>a.status==='pass')?0:1;
  }

  // Claude may store OAuth credentials in an OS keychain rather than a repository-visible file.
  // Ask the CLI that will perform the run; environment tokens remain the non-interactive CI path.
  const fromFile = loadDotEnv(PLUGIN_ROOT);
  const authed = claudeAuthenticated(process.env,spawnSync,{product:products});
  if (fromFile && authed) console.log('credentials: .env');
  if (!authed && (products || !argv.includes('--force'))) {
    if (products || argv.includes('--require-auth')) {
      console.error(products?'Product trials require an environment API key or token; host keychains are not mounted.':'Claude credentials are required for this eval run, but none were found.');
      return 2;
    }
    // Never block a contributor who only wanted `node --test`.
    console.log('No Claude credentials found — skipping the model half of the suite. Tasks validated.');
    console.log('Run `claude auth login`, then confirm `claude auth status` reports "loggedIn": true.');
    return 0;
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
    harnessBin: path.join(PLUGIN_ROOT, '.aidlc', 'bin', 'harness'),
    invoke: args => claudeInvoker({ pluginDir: PLUGIN_ROOT, model: products && args.phase==='review' ? models.evaluator : evalModel })(args),
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
