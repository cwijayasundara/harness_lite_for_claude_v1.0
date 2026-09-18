// The real invoker. It is injected rather than imported by the runner, so the runner and the
// assertion engine are unit-testable with no model, no key and no spend.
import { spawn, spawnSync } from 'node:child_process';
import { requireSubscription, subscriptionArgs } from '../../.aidlc/lib/claude-auth.mjs';
import { resolveBoundary, boundaryArgs } from './boundary.mjs';

// Comparison models are explicit; unavailable models are never substituted.
export function invokerArgs({ prompt, model = null, pluginDir = null, budgetUsd = null, product = false, sessionId = null, review = false, native = false, comparison = false, boundary = null, maxTurns = null }) {
  if (product && review) return ['-p', prompt, '--model', model, '--tools', 'Read,Grep,Glob',
    '--safe-mode', '--permission-mode', 'dontAsk', '--setting-sources', '', '--strict-mcp-config',
    '--mcp-config', '{"mcpServers":{}}', '--settings', '{"disableAllHooks":true}',
    '--no-session-persistence', '--output-format', 'json', '--max-budget-usd', String(budgetUsd)];
  // G20. Permission, settings and MCP flags belong to the boundary when there is one: two places
  // setting `--permission-mode` is two answers to "what may this run do", and the CLI would take
  // whichever came last rather than whichever was meant.
  if (product) return [
    '-p', prompt, '--model', model, '--tools', comparison ? 'Read,Grep,Glob,Write,Edit,Bash' : 'Read,Grep,Glob,Write,Edit',
    ...(boundary ? [] : [
      ...(comparison ? ['--allowedTools', 'Bash'] : []),
      '--setting-sources', 'project', '--permission-mode', 'acceptEdits',
      '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    ]),
    // `/plugin` was the container mount. With no container the staged plugin lives wherever
    // stageProduct put it, and a product trial that still asked for /plugin loaded nothing.
    '--output-format', 'json', ...(native ? [] : ['--plugin-dir', pluginDir ?? '/plugin']),
    '--max-budget-usd', String(budgetUsd), ...(sessionId ? ['--resume', sessionId] : []),
  ];
  return [
      '-p', prompt,
      ...(model ? ['--model', model] : []),
      // one-integration-test, from a-diff-belongs-to-one-change F28: the child inherited the
      // developer's user-level plugins, and a `brainstorming` skill's approval gate stopped a
      // sprint with a design and no code. What the suite measures must not depend on whose laptop
      // runs it: the fixture's own `.claude/` and the harness plugin, and nothing from `~`.
      '--setting-sources', 'project,local',
      // Evals run against a disposable copy in mkdtemp, so permission prompts measure the CLI
      // rather than the guides. MEASURED: under `acceptEdits` the model's own skills told it to
      // run `.aidlc/bin/harness` and to write `.aidlc/artifacts/...`, and both were denied —
      // six tasks failed while every guide behaved correctly. Real repositories get the scoped
      // grant that `harness init` writes into settings.json instead of this.
      // MEASURED: --dangerously-skip-permissions alone is inert — the CLI needs its enabling
      // flag as well, and without both the model's edits are silently denied and the task
      // fails with an empty transcript. That empty transcript is the tell.
      '--allow-dangerously-skip-permissions', '--dangerously-skip-permissions',
      '--output-format', 'json',
      // G23. `subscriptionArgs` adds `--max-turns 30` when nothing else set one, and a task that
      // legitimately needs more was graded `ungraded: max_turns` rather than passed or failed —
      // which is a measurement that did not happen, wearing the shape of one that did.
      ...(maxTurns ? ['--max-turns', String(maxTurns)] : []),
      ...(pluginDir ? ['--plugin-dir', pluginDir] : []),
      ...(budgetUsd ? ['--max-budget-usd', String(budgetUsd)] : []),
  ];
}

// These former flags granted self-approval. Never propagate them, even from the operator.
export function invokerEnv({ pluginDir = null, base = {} }) {
  const env = { ...base, ...(pluginDir ? { HARNESS_HOME: pluginDir } : {}) };
  delete env.AIDLC_EVAL;
  delete env.AIDLC_UNATTENDED;
  return env;
}


// G23. The model call, asynchronously, with `spawnSync`'s result shape so nothing downstream had
// to change. It was synchronous, which meant the whole Node process blocked for the length of a
// model call — so `runSuite`'s concurrency pool awaited one task at a time and four lanes ran
// exactly as fast as one. MEASURED: a 22-task suite took the same ~7 minutes per task either way.
//
// `spawnSync` is kept for `requireSubscription`'s own `claude auth status` probe: that is a fast,
// local call whose result the synchronous preamble needs before it decides anything.
export function runClaude(args, { cwd, env, timeoutMs, maxBuffer = 64 * 1024 * 1024, bin = 'claude' }) {
  return new Promise((resolve) => {
    let child;
    // stdin is /dev/null, not an open pipe nobody writes to. MEASURED 2026-09-16, the G24 pilot
    // rerun: the native arm's implement turn returned one line — "Warning: no stdin data received
    // in 3s, proceeding without it. […] redirect stdin explicitly: < /dev/null to skip" — then
    // produced nothing for 7.6 minutes and was SIGKILLed on its deadline, `usage: {}`, billing
    // incomplete, and the comparison it was half of had no cost number at all. Nothing here ever
    // writes to the child's stdin; `spawnSync` closes it for you and this did not.
    try { child = spawn(bin, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { resolve({ error, status: null, signal: null, stdout: '', stderr: '' }); return; }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    // The tail, not the head: the end of a run is where it says why it stopped, and that is what
    // every reader of this output slices. Capping from the front would throw away the answer.
    const append = (current, chunk) => {
      const next = current + chunk;
      return next.length > maxBuffer ? next.slice(next.length - maxBuffer) : next;
    };
    const timer = timeoutMs > 0 ? setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs) : null;
    const finish = (extra) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, status: null, signal: null, ...extra });
    };

    child.stdout?.on('data', (d) => { stdout = append(stdout, String(d)); });
    child.stderr?.on('data', (d) => { stderr = append(stderr, String(d)); });
    child.on('error', (error) => finish({ error }));
    child.on('close', (status, signal) => finish({
      status, signal,
      // The same shape `spawnSync` reports for a timeout, so the caller's one check still works.
      ...(timedOut ? { error: Object.assign(new Error('spawnSync claude ETIMEDOUT'), { code: 'ETIMEDOUT' }) } : {}),
    }));
  });
}

export function claudeInvoker({ pluginDir, model = null, native = false, comparison = false, boundary = null }) {
  return function invoke({ prompt, cwd, timeoutMs, budgetUsd, task, sandbox = null, phase = 'plan', sessionId = null }) {
    // G20. A `sandbox` argument is what a live product trial passes: a real coding agent with
    // Write, Edit and Bash, turned loose on a seeded product. It used to run in a container;
    // `the-harness-needs-no-container` removed that and replaced it with nothing, so this refused
    // every trial and the live half of the suite went dark.
    //
    // It refuses without a boundary, not on principle. `evals/lib/boundary.mjs` names the two
    // that exist and is exact about what each is worth: an ephemeral CI runner is OS-level, and
    // the local one is the CLI's permission system — an explicit allowlist with everything else
    // denied, which constrains a cooperating agent and is not isolation. Falling through with
    // neither would run that agent directly on the operator's machine, with their files, their
    // credentials and their network.
    //
    // Synchronous on purpose: the refusal lands before any invocation setup, so there is no await
    // to race and nothing to clean up if a caller ignores the result.
    const trial = Boolean(sandbox);
    if (trial && !boundary?.ok) {
      throw new Error(`a live product trial has no boundary to run in: ${boundary?.why ?? resolveBoundary().why}`);
    }
    const args = subscriptionArgs([
      ...invokerArgs({ prompt, model, pluginDir: trial ? sandbox.plugin ?? pluginDir : pluginDir, budgetUsd, product: trial, sessionId, review: phase === 'review', native, comparison, boundary: trial ? boundary : null, maxTurns: task?.maxTurns ?? null }),
      ...(trial ? boundaryArgs(boundary, { workdir: sandbox.work ?? cwd }) : []),
    ]);
    const started = Date.now();
    const env = invokerEnv({ task, pluginDir, base: process.env });
    try { requireSubscription({ env, cwd, product: trial }); }
    catch (error) {
      if (error.code === 'ENOENT') return { notInstalled: true, transcript: '', usage: {}, exitCode: -1, error: 'the `claude` CLI is not on PATH' };
      throw error;
    }
    // Returns a promise from here on. The refusals above stay synchronous on purpose: three tests
    // assert a throw rather than a rejection, and a boundary refusal that arrived a tick later
    // would be a refusal something could already have raced past.
    return runClaude(args, { cwd, env, timeoutMs }).then((r) => {
    // A missing CLI is not a failed task — it is a broken harness, and twenty tasks failing
    // with empty transcripts is the least useful way to say so. Same lesson as exit 127 in the
    // check runner: never let an absent tool masquerade as a verdict.
    if (r.error?.code === 'ENOENT') {
      return { notInstalled: true, transcript: '', usage: {}, exitCode: -1, error: 'the `claude` CLI is not on PATH' };
    }
    const timedOut = r.error?.code === 'ETIMEDOUT' || ['SIGTERM', 'SIGKILL'].includes(r.signal);
    const raw = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    let usage = {};
    let transcript = raw;
    let incomplete = null;
    let session = null, modelUsage = null, turns = null, permissionDenials = [];
    try {
      const parsed = JSON.parse(r.stdout);
      transcript = [parsed.result, JSON.stringify(parsed)].filter(Boolean).join('\n');
      usage = { usd: parsed.total_cost_usd, ...parsed.usage };
      session = parsed.session_id; modelUsage = parsed.modelUsage; turns = parsed.num_turns;
      permissionDenials = parsed.permission_denials ?? [];
      const denied = permissionDenials.map((d) => d.tool_input?.command ?? d.tool_name);
      if (denied.length) transcript = `[permission denied: ${denied.join(' | ')}]\n${transcript}`;

      // A run that stopped before writing a result has no model output to grade. The 2026-09-02
      // suite scored two of these as model failures: both hit `--max-budget-usd` mid-task
      // (`subtype: error_max_budget_usd`), so `parsed.result` was absent, `filter(Boolean)` left
      // a transcript made only of token counts, and every transcript assertion failed — while
      // the behavioural assertions on the same tasks passed, because the work had been done.
      //
      // Same law as ENOENT above, one level down: never let a grader that could not finish
      // masquerade as a verdict. Per-task, so it does not abort the suite.
      if (parsed.is_error && !parsed.result) {
        incomplete = {
          reason: parsed.terminal_reason ?? parsed.subtype ?? 'ended without a result',
          detail: (parsed.errors ?? []).join('; ') || parsed.subtype || '',
          turns: parsed.num_turns ?? null,
        };
        // Do not hand a metadata dump to the assertion engine dressed as model output.
        transcript = '';
      }
    } catch { /* not JSON: grade the raw transcript, which is still honest */ }
    if (trial && !incomplete && (timedOut || r.status !== 0 || !session)) incomplete = { reason: timedOut ? 'timed_out' : 'cli_incomplete', detail: raw.slice(-2000) };
    return { latencyMs:Date.now()-started, requestedModel:model, transcript, usage, exitCode: r.status ?? -1, timedOut, incomplete, sessionId: session, modelUsage, turns, permissionDenials };
    });
  };
}
