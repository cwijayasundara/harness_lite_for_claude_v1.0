// G24. The harness arm of the native comparison, driven by `harness deliver` rather than by a
// scripted human relaying prompts. One driver run per sprint, against the same staged product and
// the same private grader the native arm gets.
//
// What is the arm's and what is the driver's is kept apart on purpose. The arm writes the
// proposal and records the two approvals — the external decisions — and then hands the slug to the
// driver, which must not be able to grant either. After the driver returns, the arm checks scope
// against the plan, runs the public tests and the private grader, and counts. Three counts matter
// to the completion plan's criteria and were not measured before:
//
//   evaluatorCaughtDefects — reviews that requested changes and whose repair the grader then
//                            accepted: a defect the independent review found and the arm shipped
//                            without. Read from the driver's own phase record, not inferred.
//   shippedDefects         — the grader refused what the driver delivered: the review approved a
//                            defect. The native arm's count of the same thing is its
//                            verificationFailures, and both are recorded per campaign.
//   driverStops            — the driver stopped on a bound. Not an accepted change, and not a
//                            grader verdict either.
//
// A stopped run is not retried: the driver's state says which phase it stopped in, and re-running
// it would replay the same stop. A grader failure after delivery is repaired the way the native
// arm's is — the same external repair prompt, through the same plain invoker — so the two arms
// differ in how the change was produced and reviewed, and in nothing after that.
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, renameSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadConfig } from '../../.aidlc/lib/config.mjs';
import { approvalDriver } from './approvals.mjs';
import { assertProductTree, runProductTests, PRODUCT_TEST_COMMAND, execNode } from './stage.mjs';
import { prepareProductChange, walk } from './campaign.mjs';
import { invokerEnv } from './invoker.mjs';

// One sprint's allowance. The products file's 1.5 USD per prompt is sized for a single generator
// turn; a driver run is two generator turns plus an evaluator review and possibly a repair, and
// an allowance the review cannot fit in would stop every run on max_usd and measure nothing.
export const DRIVER_BOUNDS = { max_usd: 3, max_minutes: 20 };

// The real thing: the harness CLI `harness init` recorded in the staged product, run in that
// product with the shim pointed at the same runtime — exactly what runProductCheck does.
// MEASURED 2026-09-15: running the staged plugin *copy* instead put a runtime the install record
// had never seen under every check, and each one refused on identity before running a control.
// The copy is what the graph and pruning arms patch; this arm runs the harness as shipped.
export function spawnDeliver({ work, harnessBin, slug, args, timeoutMs, env = process.env }) {
  const home = path.dirname(path.dirname(harnessBin));
  return spawnSync(process.execPath, [harnessBin, 'deliver', slug, ...args],
    { cwd: work, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, env: invokerEnv({ pluginDir: home, base: env }) });
}

function pinBounds(work, { maxUsd, maxMinutes }) {
  const file = path.join(work, '.aidlc/harness.toml');
  const text = readFileSync(file, 'utf8').replace(/\n\[deliver\][\s\S]*?(?=\n\[|$)/, '');
  writeFileSync(file, `${text.trimEnd()}\n\n# Pinned by the comparison arm: one sprint's allowance.\n[deliver]\nmax_usd = ${maxUsd}\nmax_minutes = ${maxMinutes}\n`);
}

export async function runDriverCampaign({ task: t, config, invoke, evaluateProduct, productTree: s, evidenceDir, log = () => {},
  runDeliver = spawnDeliver, charge = () => {} }) {
  mkdirSync(evidenceDir, { recursive: true });
  const cfg = loadConfig(s.work), approvals = approvalDriver(cfg);
  const result = { assertions: [], phases: [], decisions: [], completedSteps: 0, totalSteps: t.steps.length,
    usage: { usd: 0 }, billingComplete: true, approvalViolations: 0, retries: 0, regressions: 0, verificationFailures: 0,
    evaluatorCaughtDefects: 0, shippedDefects: 0, driverStops: 0, driverRuns: [], unnecessaryQuestions: null,
    boundary: 'the driver\'s own flags: --permission-mode acceptEdits, --setting-sources project, tools Read,Grep,Glob,Write,Edit,Bash, no MCP' };
  const started = Date.now();
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args], { cwd: s.work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = (message) => { assertProductTree(s.work); git('add', '-A'); if (git('status', '--porcelain')) git('commit', '-qm', message); return git('rev-parse', 'HEAD'); };
  const save = () => writeFileSync(path.join(evidenceDir, 'phases.json'), JSON.stringify(result, null, 2) + '\n');
  const event = (name, extra = {}) => { result.phases.push({ ...extra, name }); save(); log(`${config.id}/${t.id}: ${name}`); };
  const sourceDigest = () => walk(s.work).filter((f) => !f.startsWith('.aidlc/') && f !== 'CODEBASE-MAP.md').map((f) => [f, createHash('sha256').update(readFileSync(path.join(s.work, f))).digest('hex')]);
  const publicCheck = () => { const out = runProductTests(s.work); assert.equal(out.status, 0, `public tests failed: ${out.stdout}${out.stderr}`); return out.stdout; };
  const allowance = Number(t.deliverUsd ?? Math.max(Number(t.budgetUsd ?? 0), DRIVER_BOUNDS.max_usd));
  const minutes = Number(t.deliverMinutes ?? DRIVER_BOUNDS.max_minutes);

  // The same external repair the native arm gets when the grader refuses what it delivered.
  const repair = async (step, message) => {
    event('invocation-started', { phase: 'implement', prompt: message });
    let out;
    try { out = await invoke({ prompt: message, phase: 'implement', sandbox: s, cwd: s.work, sessionId: null, timeoutMs: t.timeoutMs, budgetUsd: allowance, task: t }); }
    catch (error) { result.billingComplete = false; throw Object.assign(error, { incomplete: { reason: 'invocation_error', detail: error.message } }); }
    if (Number.isFinite(out.usage?.usd) && out.usage.usd >= 0) result.usage.usd += out.usage.usd; else result.billingComplete = false;
    event('model-implement', out);
    if (out.incomplete || out.timedOut || out.exitCode !== 0) throw Object.assign(new Error('model invocation incomplete'), { incomplete: out.incomplete ?? { reason: 'cli_incomplete' } });
    assertProductTree(s.work);
  };

  try {
    result.fixtureRevision = git('rev-parse', 'HEAD');
    pinBounds(s.work, { maxUsd: allowance, maxMinutes: minutes });
    commit('Comparison arm: driver bounds');
    for (const step of t.steps) {
      if (step.restart) event('session-restart');
      if (step.rename) { renameSync(path.join(s.work, ...step.rename[0].split('/')), path.join(s.work, ...step.rename[1].split('/'))); event('external-file-rename', { paths: step.rename }); }
      if (step.seed) { const f = path.join(s.work, 'src/server.mjs'); writeFileSync(f, step.seed + readFileSync(f, 'utf8')); }
      if (step.seed || step.rename || step.incident) { let failed = false; try { await evaluateProduct(s, step); } catch (error) { failed = true; event('reproduced-product-failure', { detail: error.message }); } assert.ok(failed, 'injected failure must reproduce'); }
      if (step.characterize) await evaluateProduct(s, { ...step, level: 0 });
      commit(`Start ${step.slug}`);
      // The proposal carries the sprint's final requirement. The reject/stale protocol the
      // interactive arm exercises is a gate conversation; the driver runs after the gates, so the
      // decisions are recorded as simulated and the driver is given the requirement they produced.
      prepareProductChange(s, { ...step, initialBehaviours: step.behaviours });
      commit(`Driver proposal: ${step.slug}`);
      if (step.reject) result.decisions.push({ slug: step.slug, decision: 'reject', simulated: true, reason: step.reject });
      if (step.stale) result.decisions.push({ slug: step.slug, decision: 'stale', simulated: true });
      for (const kind of ['spec', 'plan']) approvals.decide({ slug: step.slug, kind, decision: 'approve' });
      result.decisions.push({ slug: step.slug, decision: 'approve', simulated: true, revision: git('rev-parse', 'HEAD'),
        requirementsDigest: createHash('sha256').update(JSON.stringify({ request: step.request, behaviours: step.behaviours, files: step.files })).digest('hex') });
      approvals.assertImplementation(step.slug);
      const authorized = sourceDigest();

      const args = ['--live', '--actor', `comparison:${config.id}`];
      event('invocation-started', { phase: 'deliver', slug: step.slug, args });
      const runStarted = Date.now();
      const out = runDeliver({ work: s.work, harnessBin: s.harnessBin, slug: step.slug, args, timeoutMs: minutes * 60000 + 60000 });
      // The driver prints its result pretty-printed after its progress lines: the envelope starts
      // at the last line that is exactly `{`. MEASURED 2026-09-15: reading the last line that
      // *started* with `{` read a nested object and reported a finished run as not delivered.
      const stdout = String(out.stdout ?? ''); const envelope = stdout.slice(Math.max(0, stdout.lastIndexOf('\n{\n'))).trim();
      let parsed = null; try { parsed = JSON.parse(envelope.startsWith('{') ? envelope : stdout.trim()); } catch { /* the driver did not finish its envelope */ }
      const stateFile = path.join(s.work, '.aidlc/state/deliver', step.slug, 'phases.json');
      const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : null;
      const usd = Number.isFinite(parsed?.usd) ? parsed.usd : Number.isFinite(state?.usd) ? state.usd : null;
      // A turn the driver could not price reserved its allowance; the comparison treats that as
      // unknown billing, the same way it treats an unpriced plain invocation.
      const unpriced = (state?.events ?? []).some((e) => e.event === 'model-turn-done' && e.usd == null);
      if (usd != null && !unpriced) result.usage.usd += usd; else result.billingComplete = false;
      charge(usd != null ? usd : null, allowance);
      const run = { slug: step.slug, ok: !!parsed?.ok, exitCode: out.status, error: out.error?.message ?? null, stopped: parsed?.stopped ?? null, usd,
        usd_per_accepted_change: parsed?.usd_per_accepted_change ?? null, cache_read_share: parsed?.cache_read_share ?? null, turns: parsed?.turns ?? null,
        wall_ms: parsed?.wall_ms ?? Date.now() - runStarted, repairs: parsed?.repairs ?? state?.repairs ?? null, review: parsed?.review ?? null,
        pr_unopened: parsed?.pr_unopened ?? null, denied: (state?.events ?? []).reduce((n, e) => n + (e.denied ?? 0), 0) };
      result.driverRuns.push(run);
      event('model-deliver', { slug: step.slug, usage: { usd }, result: parsed, stdout: String(out.stdout ?? '').slice(-20000), stderr: String(out.stderr ?? '').slice(-20000), durationMs: Date.now() - runStarted });
      // Keep the driver's own record beside the product: the phase file, the review, the PR body.
      const keep = path.join(evidenceDir, 'deliver', step.slug); mkdirSync(keep, { recursive: true });
      if (state) writeFileSync(path.join(keep, 'phases.json'), JSON.stringify(state, null, 2) + '\n');
      for (const name of ['review.md', 'pr.md']) { const f = path.join(s.work, '.aidlc/artifacts', step.slug, name); if (existsSync(f)) cpSync(f, path.join(keep, name)); }
      if (!parsed?.ok) {
        result.driverStops++;
        throw new Error(`the driver did not deliver ${step.slug}: ${parsed?.stopped ? `${parsed.stopped.bound} — ${parsed.stopped.detail}` : out.error?.message ?? `exit ${out.status}: ${String(out.stderr ?? '').trim().split('\n').pop()}`}`);
      }
      // Every review that requested changes and was repaired is a defect the evaluator caught
      // before the grader saw it — provided the grader then accepts the result, which is checked
      // below before the count is final.
      const caught = (state?.events ?? []).filter((e) => e.phase === 'repair' && e.event === 'repaired').length;

      const validateScope = () => {
        const previous = new Map(authorized), current = new Map(sourceDigest());
        const changed = [...new Set([...previous.keys(), ...current.keys()])].filter((f) => previous.get(f) !== current.get(f));
        assert.ok(changed.every((f) => step.files.includes(f)), `out-of-scope changes: ${changed.filter((f) => !step.files.includes(f))}`);
        try { approvals.assertImplementation(step.slug); } catch (error) { result.approvalViolations++; throw error; }
      };
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          validateScope(); const publicOutput = publicCheck(); const proof = await evaluateProduct(s, step);
          result.assertions.push(proof); event('product-proof', { slug: step.slug, publicOutput, ...proof }); break;
        } catch (error) {
          if (error.incomplete) throw error;
          result.verificationFailures++; result.regressions = null;
          if (attempt === 0) result.shippedDefects++; // the review approved this; the grader did not
          event('product-proof-failed', { slug: step.slug, candidateRevision: commit('Failed verification candidate'), detail: error.message });
          if (attempt === 2) throw error;
          result.retries++;
          await repair(step, `Repair within the same approved scope (${step.files.join(', ')}). External verification failed: ${error.message}\nRun ${PRODUCT_TEST_COMMAND}. Do not modify approval artifacts.`);
        }
      }
      result.evaluatorCaughtDefects += caught;
      const intent = path.join(s.work, '.aidlc/artifacts', step.slug, 'intent.md');
      writeFileSync(intent, readFileSync(intent, 'utf8').replace('status: draft', 'status: closed'));
      result.candidateRevision = commit(`Accepted ${step.slug}`); result.completedSteps++;
      event('accepted-change', { slug: step.slug, candidateRevision: result.candidateRevision, evaluatorCaughtDefects: caught });
    }
  } catch (error) {
    if (error.incomplete) result.incomplete = error.incomplete;
    else result.assertions.push({ name: 'driver-campaign', pass: false, detail: error.message });
    event('campaign-stopped', { error: error.message });
  } finally {
    result.latencyMs = Date.now() - started; result.approvals = approvals.events();
    result.usage.reportedUsd = result.usage.usd; if (!result.billingComplete) result.usage.usd = null;
    result.pass = !result.incomplete && result.completedSteps === result.totalSteps && result.assertions.length > 0 && result.assertions.every((a) => a.pass);
    save(); cpSync(s.work, path.join(evidenceDir, 'product'), { recursive: true, dereference: false, verbatimSymlinks: true });
    if (s.data && existsSync(s.data)) cpSync(s.data, path.join(evidenceDir, 'runtime-data'), { recursive: true });
  }
  return result;
}
