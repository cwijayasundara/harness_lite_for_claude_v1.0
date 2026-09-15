// G09. The delivery engine: the seven phases between the plan approval and the merge decision.
//
// The harness had every stage of the playbook and nothing that drove them. A human typed
// `implement`, read the result, typed `harness check`, read the findings, typed `implement`
// again — relaying output from one command into the next with no decision attached to any of it.
// Law 8 names that shape as the wrong one: gates belong at the edges, not in the middle.
//
// Law 2 puts the sequencing here, in the CLI layer, and not in a SKILL.md: this is a phase
// machine, which is exactly what a skill may not contain.
//
// Two negative properties carry the design, and neither is enforced by a guard — the driver runs
// no hook, and the artifact directory is always writable:
//
//   * it never grants a gate it did not receive. The one approval it can write is the one
//     `[gates].<gate> = "auto"` already gave, recorded through `artifacts.approve` with
//     `policy: true`, which that function refuses in every other mode.
//   * it never declares its own change merge-ready. `status: approved` in a review artifact is
//     what advances a change to `merge`; this module does not write that key, and does not
//     merge. The third gate is the human's, against branch protection.
//
// Both are asserted over a complete run in test/deliver.test.mjs rather than argued for here.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as artifacts from './artifacts.mjs';
import * as ledger from './ledger.mjs';
import * as graph from './graph.mjs';
import { gateMode, stageModel, DEFAULT_DELIVER } from './config.mjs';
import { check as runnerCheck } from './runner.mjs';
import { review as runReview } from './review.mjs';
import { runSubscriptionClaude } from './claude-auth.mjs';

// Recorded before each phase starts and after it ends, so a killed run is resumable and not
// merely diagnosable. `evals/lib/campaign.mjs` already wrote incremental state that nothing ever
// read back; this is the same shape with the read.
export const PHASES = ['implement', 'check-stop', 'refactor', 'review', 'repair', 'check-commit', 'pr'];
export const STATE_VERSION = 1;



export function bounds(cfg) {
  const raw = cfg?.deliver ?? {};
  const out = {};
  for (const [key, fallback] of Object.entries(DEFAULT_DELIVER)) {
    const value = raw[key] ?? fallback;
    if (!(Number.isFinite(Number(value)) && Number(value) > 0)) throw new Error(`[deliver].${key} must be a positive number`);
    out[key] = Number(value);
  }
  return out;
}

export const stateDir = (cfg, slug) => path.join(cfg.layout.state, 'deliver', slug);
export const statePath = (cfg, slug) => path.join(stateDir(cfg, slug), 'phases.json');

export function readState(cfg, slug) {
  const file = statePath(cfg, slug);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

function writeState(cfg, slug, state) {
  mkdirSync(stateDir(cfg, slug), { recursive: true });
  writeFileSync(statePath(cfg, slug), JSON.stringify(state, null, 2) + '\n');
  return state;
}

// The resumption key. A moved plan digest means a human changed the gate while the run was
// stopped, and the authority it was executing under is gone: resuming would carry out an
// approved-then-withdrawn plan. Refusing is the whole point; starting a fresh run remains
// available.
export function planDigest(cfg, slug) {
  const plan = artifacts.read(cfg, slug, 'plan');
  if (!plan) throw new Error(`no plan for ${slug} — write and approve one before delivering it`);
  return plan.front.approval_digest ?? plan.front.digest ?? artifacts.bodyDigest(plan.text);
}

const git = (root, ...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args],
  { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

// A commit is not an approval. The driver commits because a review, a candidate check and a pull
// request all read committed revisions — never to advance a gate.
function commitIfDirty(root, message) {
  if (!git(root, 'status', '--porcelain')) return null;
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', message);
  return git(root, 'rev-parse', 'HEAD');
}

// Findings the repair turn is asked to address. Blocking and Important only: a nit is not worth a
// model turn, and the reviewer is told to separate them.
export function reviewVerdict(report) {
  const text = String(report ?? '');
  const findings = text.split('\n').filter((line) => /^#{2,4}\s*(Blocking|Important)\b/i.test(line) || /^\*\*(Blocking|Important)\b/i.test(line));
  // The reviewer's own last word. `changes-requested` anywhere in the verdict region is the
  // conservative read: an ambiguous review is not an approval.
  const requested = /changes-requested/i.test(text);
  return { verdict: requested ? 'changes-requested' : 'approve', findings };
}

// G15. Every suppression the commit-stage checks saw, with its reason, on the pull request. A
// `why:` is what turns an override into a decision someone can disagree with — and the person
// deciding the merge is the one who can.
export function suppressionsOf(report) {
  return (report?.controls ?? []).flatMap((c) => c.suppressions ?? []);
}

function prBody({ slug, spec, plan, review, invocation, bounds: b, usd, gates, scope, suppressions = [] }) {
  const row = (kind, artifact) => {
    const front = artifact?.front ?? {};
    const who = front.approved_by === 'policy' ? `policy (${front.policy_digest ?? 'no digest'})` : front.by ?? '—';
    return `| ${kind} | ${front.status ?? 'absent'} | ${gates[kind]} | ${who} | ${front.at ?? '—'} |`;
  };
  return [
    `Harness-Change: ${slug}`,
    '',
    '## Approvals',
    '',
    '| gate | status | mode | by | at |',
    '|---|---|---|---|---|',
    row('spec', spec),
    row('plan', plan),
    '',
    '## Review',
    '',
    `Verdict: **${review?.verdict ?? 'not run'}**${review?.status === 'incomplete' ? ' (review incomplete: ' + review.reason + ')' : ''}`,
    review?.output ? `Report: \`${review.output}\`` : '',
    '',
    ...(suppressions.length ? [
      '## Suppressions',
      '',
      'These were added with a reason. The reason is the point — disagree with one here rather than',
      'after it merges.',
      '',
      '| file | line | suppression | why |',
      '|---|---:|---|---|',
      ...suppressions.map((s) => `| \`${s.file}\` | ${s.line} | \`${s.rule}\` | ${s.why || '(no reason given)'} |`),
      '',
    ] : []),
    '## Run',
    '',
    `Ledger invocation: \`${invocation}\``,
    `Spend: USD ${usd.toFixed(4)} (usage estimate, not an invoice) of ${b.max_usd}`,
    `Review export: ${scope ?? 'full candidate tree'}`,
    '',
    'The merge gate is the human\'s. This driver ran the checks and obtained the review; it',
    'approved nothing and merged nothing.',
    '',
  ].filter((line) => line !== '').join('\n') + '\n';
}

// The real model turn. Hooks stay armed (`--setting-sources project`) so the project's own
// post-write fast check keeps returning findings to the model inside the turn: the inner
// code/test/refactor loop is that hook, not a driver phase.
//
// MEASURED 2026-09-15, the first live run: the turns loaded no plugin. `--setting-sources project`
// reads the consumer's settings.json, whose `enabledPlugins` names a marketplace install the
// laptop did not have, so `implement` was a skill that did not exist and the hooks never ran.
// The CLI already knows which harness it is — `pluginDir` is the root `bin/harness` runs from —
// and passes it the way the README's own dev path does (`claude --plugin-dir`), with HARNESS_HOME
// set so the consumer's shim resolves the same runtime inside the turn's hooks.
export function deliverInvoker({ root, pluginDir = null, run = runSubscriptionClaude }) {
  return function invoke({ prompt, model, effort = null, sessionId = null, budgetUsd, timeoutMs }) {
    const args = ['-p', prompt, '--model', model, ...(effort ? ['--effort', effort] : []),
      '--tools', 'Read,Grep,Glob,Write,Edit,Bash',
      '--setting-sources', 'project', '--permission-mode', 'acceptEdits',
      '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--output-format', 'json',
      ...(pluginDir ? ['--plugin-dir', pluginDir] : []),
      '--max-budget-usd', String(budgetUsd), ...(sessionId ? ['--resume', sessionId] : [])];
    // Nothing in the kernel reads AIDLC_UNATTENDED today — it exists so a steering file can tell
    // a turn that no human is waiting to answer a question. The prompt says so as well, because
    // an environment variable no code reads steers nothing on its own.
    const started = Date.now();
    const out = run(args, { cwd: root, env: { ...process.env, AIDLC_UNATTENDED: '1', ...(pluginDir ? { HARNESS_HOME: pluginDir } : {}) },
      encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
    if (out.error?.code === 'ENOENT') return { ok: false, transcript: '', error: 'the `claude` CLI is not on PATH' };
    let parsed = null;
    try { parsed = JSON.parse(out.stdout); } catch { /* not JSON: the raw transcript is still honest */ }
    const denied = (parsed?.permission_denials ?? []).map((d) => d.tool_input?.command ?? d.tool_name);
    return {
      ok: !out.error && !out.signal && out.status === 0 && !parsed?.is_error,
      transcript: parsed?.result ?? String(out.stdout ?? ''),
      usd: parsed?.total_cost_usd, sessionId: parsed?.session_id ?? sessionId,
      // The numbers a run is graded on. The CLI reports them per envelope; the driver sums them.
      usage: parsed?.usage ?? null, durationMs: parsed?.duration_ms ?? Date.now() - started,
      turns: parsed?.num_turns ?? null, denied,
      error: out.error?.message ?? (out.signal ? `killed by ${out.signal}` : null),
    };
  };
}

const USAGE_KEYS = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens'];
const emptyUsage = () => Object.fromEntries(USAGE_KEYS.map((k) => [k, 0]));
function addUsage(total, usage) {
  for (const k of USAGE_KEYS) total[k] = (total[k] ?? 0) + (Number.isFinite(usage?.[k]) ? usage[k] : 0);
  return total;
}
// What fraction of the prompt tokens the model read from cache. The prefix-cache guard exists
// because this number is what a subscription's cost actually tracks.
export function cacheReadShare(usage) {
  const prompt = (usage?.input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0);
  return prompt ? Math.round((usage.cache_read_input_tokens ?? 0) / prompt * 10000) / 10000 : null;
}

// The seventh phase's one side effect on the outside world. `gh pr create` and nothing else: no
// merge flag, no auto-merge, no admin override. What it opens is a pull request a human decides on.
export function ghPullRequest({ root }) {
  return function openPr({ title, body, base }) {
    const args = ['pr', 'create', '--title', title, '--body-file', '-', ...(base ? ['--base', base] : [])];
    const out = spawnSync('gh', args, { cwd: root, input: body, encoding: 'utf8', timeout: 120000 });
    if (out.error?.code === 'ENOENT') throw new Error('the `gh` CLI is not on PATH: the driver reached a merge-ready branch but could not open the pull request');
    if (out.status !== 0) throw new Error(`gh pr create failed: ${out.stderr?.trim() || out.status}`);
    return { url: String(out.stdout ?? '').trim().split('\n').filter(Boolean).pop() ?? null };
  };
}

const UNATTENDED = 'No human is available to answer a question in this turn: make the routine ' +
  'choices the approved plan already implies, and record anything genuinely undecidable in the ' +
  'change\'s artifacts instead of ending the turn on a question.';

export async function deliver(cfg, slug, {
  invoke,
  check = (stage) => runnerCheck(cfg, { stage }),
  review = (options) => runReview(options),
  openPr,
  now = () => Date.now(),
  log = () => {},
  live = false,
  dry = false,
  actor = 'harness-deliver',
  base = null,
} = {}) {
  const root = cfg.layout.root;
  const b = bounds(cfg);
  const gates = { spec: gateMode(cfg, 'spec'), plan: gateMode(cfg, 'plan') };
  const spec = artifacts.read(cfg, slug, 'spec');
  const plan = artifacts.read(cfg, slug, 'plan');
  if (!plan) throw new Error(`no plan for ${slug} — write and approve one before delivering it`);
  const owns = artifacts.ownedFiles(plan.body);
  if (!owns.length) throw new Error(`${slug}'s plan declares no files under "## Files" — the driver has no scope to work in`);

  if (dry) {
    return { slug, dry: true, phases: PHASES, gates, owns, bounds: b, spend: 0,
      // A preview that does not say what it would run on is not a preview.
      stages: Object.fromEntries(['implement', 'refactor', 'repair', 'repair-escalated', 'review']
        .map((stage) => [stage, stageModel(cfg, stage)])) };
  }
  if (!live) throw new Error(`harness deliver invokes models; run it with --live (or --dry to preview the phases, models and bounds)`);

  // `auto` records the approval the configuration already gave. `human` refuses to start without
  // one. `advisory` proceeds and carries the gap onto the PR, where the merge decision reads it.
  for (const kind of artifacts.GATED) {
    const artifact = artifacts.read(cfg, slug, kind);
    if (artifact?.state === 'approved') continue;
    if (gates[kind] === 'auto') { artifacts.approve(cfg, slug, kind, { by: actor, policy: true }); continue; }
    if (gates[kind] === 'human') throw new Error(`${slug}'s ${kind} is ${artifact?.state ?? 'absent'} and [gates].${kind} = "human" — a person approves it before the driver runs`);
  }

  const digest = planDigest(cfg, slug);
  const previous = readState(cfg, slug);
  if (previous && previous.plan_digest !== digest) {
    throw new Error(`${slug}'s approved plan changed since the interrupted run (recorded ${previous.plan_digest}, now ${digest}). ` +
      'The authority that run was executing under is gone. Delete .aidlc/state/deliver/' + slug + '/phases.json to start a fresh run against the new plan.');
  }

  const invocation = ledger.runId(cfg.layout);
  const state = previous ?? writeState(cfg, slug, {
    version: STATE_VERSION, slug, invocation, plan_digest: digest, actor,
    started: new Date(now()).toISOString(), deadline: now() + b.max_minutes * 60000,
    base: base ?? git(root, 'rev-parse', 'HEAD'), completed: [], repairs: 0, usd: 0,
    usage: emptyUsage(), turns: 0,
    session: null, events: [], stopped: null, pr: null,
  });
  state.usage ??= emptyUsage(); state.turns ??= 0; // a run recorded before these were counted
  state.deadline = now() + b.max_minutes * 60000; // a resumed run gets its own wall-clock
  state.stopped = null;
  const save = () => writeState(cfg, slug, state);
  const event = (phase, event, extra = {}) => {
    state.events.push({ phase, event, at: new Date(now()).toISOString(), ...extra });
    save();
    log(`${slug}: ${phase} ${event}`);
    ledger.append({ kind: 'deliver-phase', change: slug, phase, event, actor, ...extra }, cfg.layout);
  };

  // Checked before every phase and before every model call. A bound is not a verdict on the
  // change: the run is `stopped` with the bound named, and the state it leaves is resumable.
  const exceeded = () => {
    if (now() >= state.deadline) return 'max_minutes';
    if (state.usd >= b.max_usd) return 'max_usd';
    return null;
  };
  const stop = (bound, detail) => {
    state.stopped = { bound, detail, at: new Date(now()).toISOString() };
    save();
    event('run', 'stopped', { bound, detail });
    return { slug, ok: false, stopped: state.stopped, usd: state.usd, completed: state.completed, invocation, pr: null };
  };

  // G10. One table decides which model and which effort a phase runs on, and the same pair is
  // what the ledger row names — so what ran and what was recorded cannot drift apart.
  const turn = async (stage, prompt) => {
    const bound = exceeded();
    if (bound) return { stopped: bound };
    const { model, effort } = stageModel(cfg, stage);
    event(stage.replace(/-escalated$/, ''), 'model-turn', { model, effort, stage });
    const out = await invoke({ phase: stage, prompt: `${prompt}\n\n${UNATTENDED}`, model, effort, sessionId: state.session,
      budgetUsd: Math.max(0.01, b.max_usd - state.usd), timeoutMs: Math.max(1000, state.deadline - now()) });
    // An unreported cost reserves its full allowance rather than counting as free.
    state.usd += Number.isFinite(out?.usd) ? out.usd : Math.max(0.01, b.max_usd - state.usd);
    if (out?.sessionId) state.session = out.sessionId;
    addUsage(state.usage, out?.usage); state.turns += Number.isFinite(out?.turns) ? out.turns : 0;
    save();
    event(stage.replace(/-escalated$/, ''), 'model-turn-done', { stage, usd: Number.isFinite(out?.usd) ? out.usd : null,
      durationMs: out?.durationMs ?? null, turns: out?.turns ?? null, usage: out?.usage ?? null, denied: out?.denied?.length ?? 0 });
    return out;
  };

  const contract = `Change: ${slug}\nSpec: .aidlc/artifacts/${slug}/spec.md\nPlan: .aidlc/artifacts/${slug}/plan.md\n` +
    `Files this plan owns: ${owns.map((f) => `\`${f}\``).join(', ')}\n`;

  let reviewResult = state.review ?? null;

  for (const phase of PHASES) {
    if (state.completed.includes(phase)) { log(`${slug}: ${phase} already done`); continue; }
    const bound = exceeded();
    if (bound) return stop(bound, `before ${phase}`);
    event(phase, 'start');

    if (phase === 'implement') {
      const out = await turn('implement', `Use the \`implement\` skill to deliver this approved change.\n\n${contract}\n` +
        'Work only inside the files the plan owns. Run the focused proof for each behaviour as you go.');
      if (out.stopped) return stop(out.stopped, 'before the implement turn');
      if (!out.ok) return stop('implement', out.error ?? 'the implement turn did not complete');
      commitIfDirty(root, `${slug}: implement`);
    }

    if (phase === 'check-stop') {
      let report = await check('stop');
      if (!report.ok) {
        // One repair turn, then stop. A loop that cannot make its own checks pass in one attempt
        // is looping rather than fixing, and the human gets the failure rather than the spend.
        event(phase, 'repairing', { failed: failedControls(report) });
        const out = await turn('repair', `\`harness check --stage stop\` failed on this change.\n\n${contract}\n` +
          `Failing controls: ${failedControls(report).join(', ')}\n\n${renderFailures(report)}\n` +
          'Fix the cause inside the plan\'s files. Do not suppress a control or relax an assertion to make it pass.');
        if (out.stopped) return stop(out.stopped, 'before the check repair turn');
        commitIfDirty(root, `${slug}: repair check --stage stop`);
        report = await check('stop');
      }
      if (!report.ok) return stop('check-stop', `stop-stage checks still failing: ${failedControls(report).join(', ')}`);
    }

    if (phase === 'refactor') {
      const out = await turn('refactor', `The checks are green. Make one refactoring pass over the change: no behaviour change, ` +
        `no new capability, no test edits that weaken a proof.\n\n${contract}`);
      if (out.stopped) return stop(out.stopped, 'before the refactor turn');
      commitIfDirty(root, `${slug}: refactor`);
      const report = await check('stop');
      // A refactor that breaks green is not a refactor. The human gets the branch as it stands.
      if (!report.ok) return stop('refactor', `the refactor turn left the stop stage failing: ${failedControls(report).join(', ')}`);
    }

    if (phase === 'review') {
      reviewResult = await runReviewPhase();
      if (reviewResult.stopped) return stop(reviewResult.stopped, 'before the review');
      state.review = reviewResult;
      save();
    }

    if (phase === 'repair') {
      while (reviewResult?.verdict === 'changes-requested') {
        if (state.repairs >= b.max_repairs) {
          return stop('max_repairs', `${state.repairs} repair turns did not clear the review; the findings are the human's to judge`);
        }
        // The second attempt escalates: the same model that could not fix it once is unlikely to
        // fix it twice, and the judgment model is what the review itself runs on.
        const stage = state.repairs === 0 ? 'repair' : 'repair-escalated';
        const out = await turn(stage, `The independent review requested changes.\n\n${contract}\n` +
          `Review report: \`${reviewResult.output}\`\n\n${reviewResult.findings.join('\n') || '(see the report)'}\n\n` +
          'Address every Blocking and Important finding inside the plan\'s files. A finding you disagree with is ' +
          'answered in the change\'s artifacts with a reason, not silently left.');
        if (out.stopped) return stop(out.stopped, `before repair turn ${state.repairs + 1}`);
        state.repairs += 1;
        save();
        commitIfDirty(root, `${slug}: repair review findings (${state.repairs})`);
        event(phase, 'repaired', { attempt: state.repairs, ...stageModel(cfg, stage) });
        reviewResult = await runReviewPhase();
        if (reviewResult.stopped) return stop(reviewResult.stopped, 'before the confirming review');
        state.review = reviewResult;
        save();
      }
    }

    if (phase === 'check-commit') {
      const report = await check('commit');
      if (!report.ok) return stop('check-commit', `commit-stage checks failing: ${failedControls(report).join(', ')}`);
      state.suppressions = suppressionsOf(report);
      save();
    }

    if (phase === 'pr') {
      const head = git(root, 'rev-parse', '--abbrev-ref', 'HEAD');
      const body = prBody({ slug, spec: artifacts.read(cfg, slug, 'spec') ?? spec, plan: artifacts.read(cfg, slug, 'plan'),
        review: reviewResult, invocation, bounds: b, usd: state.usd, gates, suppressions: state.suppressions ?? [],
        scope: reviewResult?.export?.scope === 'plan' ? `scoped to ${reviewResult.export.files} files` : 'full candidate tree' });
      // MEASURED 2026-09-15: a fixture with no GitHub remote threw here, after every dollar of the
      // run was spent, and the result went with it. The body is what the human merges from, so
      // it is written first; a pull request the host cannot open is a recorded fact, not a lost run.
      writeFileSync(path.join(cfg.layout.artifacts, slug, 'pr.md'), body);
      try {
        const pr = await openPr({ title: `${slug}`, body, head, base: state.base });
        state.pr = pr?.url ?? null;
      } catch (error) {
        state.pr = null; state.pr_unopened = error.message;
        event(phase, 'unopened', { reason: error.message });
      }
      save();
    }

    state.completed.push(phase);
    event(phase, 'end');
  }

  // The three numbers Phase 2's exit criterion asks for — cost per accepted change, cache-read
  // share, wall-clock — in the ledger, in the change's review.md, and in the result. "Accepted"
  // here means the driver delivered it; the merge is still the human's, so the denominator is one.
  const wallMs = now() - Date.parse(state.started);
  const share = cacheReadShare(state.usage);
  const economics = { usd: state.usd, usd_per_accepted_change: state.usd, cache_read_share: share, turns: state.turns,
    wall_ms: wallMs, repairs: state.repairs, usage: { ...state.usage } };
  ledger.append({ kind: 'deliver-run', change: slug, actor, pr: state.pr, ...economics }, cfg.layout);
  const reviewFile = path.join(cfg.layout.artifacts, slug, 'review.md');
  if (existsSync(reviewFile)) {
    writeFileSync(reviewFile, readFileSync(reviewFile, 'utf8').trimEnd() + '\n\n## Delivery run\n\n' +
      `Invocation: \`${invocation}\` · wall-clock ${Math.round(wallMs / 1000)}s · USD ${state.usd.toFixed(4)} (usage estimate, not an invoice) · ` +
      `cost per accepted change USD ${state.usd.toFixed(4)} · turns ${state.turns} · ` +
      `cache-read share ${share == null ? 'unmeasured' : Math.round(share * 100) + '%'} · repairs ${state.repairs}\n`);
  }
  return { slug, ok: true, stopped: null, completed: state.completed, invocation, ...economics,
    pr: state.pr, ...(state.pr_unopened ? { pr_unopened: state.pr_unopened } : {}),
    review: reviewResult ? { verdict: reviewResult.verdict, status: reviewResult.status } : null };

  async function runReviewPhase() {
    const bound = exceeded();
    if (bound) return { stopped: bound };
    const { model, effort } = stageModel(cfg, 'review');
    event('review', 'model-turn', { model, effort, stage: 'review' });
    const candidate = git(root, 'rev-parse', 'HEAD');
    const output = path.join(path.relative(root, cfg.layout.artifacts), slug, 'review.md');
    const result = await review({
      root, base: state.base, candidate, model, output,
      budgetUsd: Math.max(0.01, b.max_usd - state.usd),
      planFiles: owns, contextPaths: [path.join(path.relative(root, cfg.layout.artifacts), slug)],
      modules: graph.load(cfg)?.modules ?? null,
    });
    if (Number.isFinite(result?.usd)) state.usd += result.usd;
    addUsage(state.usage, result?.usage); save();
    event('review', 'model-turn-done', { stage: 'review', usd: Number.isFinite(result?.usd) ? result.usd : null,
      durationMs: result?.durationMs ?? null, usage: result?.usage ?? null, status: result?.status ?? null });
    const report = existsSync(path.resolve(root, output)) ? readFileSync(path.resolve(root, output), 'utf8') : '';
    return { ...result, output, ...reviewVerdict(report) };
  }
}

const failedControls = (report) => (report?.controls ?? report?.results ?? [])
  .filter((r) => r.verdict === 'fail' || r.verdict === 'errored').map((r) => r.control);

const renderFailures = (report) => (report?.controls ?? report?.results ?? [])
  .filter((r) => r.verdict === 'fail' || r.verdict === 'errored')
  .map((r) => `${r.control}: ${(r.findings ?? []).map((f) => `${f.file ?? ''}${f.line ? ':' + f.line : ''} ${f.message ?? ''}`).join('\n  ') || r.error || 'failed'}`)
  .join('\n');
