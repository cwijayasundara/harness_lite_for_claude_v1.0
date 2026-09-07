// The real invoker. It is injected rather than imported by the runner, so the runner and the
// assertion engine are unit-testable with no model, no key and no spend.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { productDockerArgs } from './stage.mjs';

// Comparison models are explicit; unavailable models are never substituted.
export function invokerArgs({ prompt, model = null, pluginDir = null, budgetUsd = null, product = false, sessionId = null, review = false, native = false, comparison = false }) {
  if (product && review) return ['-p', prompt, '--model', model, '--tools', 'Read,Grep,Glob',
    '--safe-mode', '--permission-mode', 'dontAsk', '--setting-sources', '', '--strict-mcp-config',
    '--mcp-config', '{"mcpServers":{}}', '--settings', '{"disableAllHooks":true}',
    '--no-session-persistence', '--output-format', 'json', '--max-budget-usd', String(budgetUsd)];
  if (product) return [
    '-p', prompt, '--model', model, '--tools', comparison ? 'Read,Grep,Glob,Write,Edit,Bash' : 'Read,Grep,Glob,Write,Edit',
    ...(comparison ? ['--allowedTools','Bash(rg *)','Bash(sed *)','Bash(node --test*)'] : []),
    '--setting-sources', 'project', '--permission-mode', 'acceptEdits',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--output-format', 'json', ...(native ? [] : ['--plugin-dir','/plugin']),
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

export function claudeInvoker({ pluginDir, model = null, native = false, comparison = false }) {
  return function invoke({ prompt, cwd, timeoutMs, budgetUsd, task, sandbox = null, phase = 'plan', sessionId = null }) {
    const args = invokerArgs({ prompt, model, pluginDir, budgetUsd, product: !!sandbox, sessionId, review: phase === 'review', native, comparison });
    const started = Date.now();
    const env = invokerEnv({ task, pluginDir, base: process.env });
    const name = sandbox ? `harness-agent-${randomUUID()}` : null;
    const credentials = Object.fromEntries(['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_OAUTH_TOKEN'].filter(k => env[k]).map(k => [k, undefined]));
    const command = sandbox ? 'docker' : 'claude';
    const commandArgs = sandbox ? [...productDockerArgs(sandbox, { phase, name, network: true, env: credentials }), 'claude', ...args] : args;
    const r = spawnSync(command, commandArgs, { cwd, env, encoding: 'utf8', timeout: timeoutMs,
      killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024 });
    if (sandbox && (r.error || r.signal)) spawnSync('docker', ['rm', '-f', name], { encoding: 'utf8', timeout: 10000 });
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
    let session = null, modelUsage = null, turns = null;
    try {
      const parsed = JSON.parse(r.stdout);
      transcript = [parsed.result, JSON.stringify(parsed)].filter(Boolean).join('\n');
      usage = { usd: parsed.total_cost_usd, ...parsed.usage };
      session = parsed.session_id; modelUsage = parsed.modelUsage; turns = parsed.num_turns;
      const denied = (parsed.permission_denials ?? []).map((d) => d.tool_input?.command ?? d.tool_name);
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
    if (sandbox && !incomplete && (timedOut || r.status !== 0 || !session)) incomplete = { reason: timedOut ? 'timed_out' : 'cli_incomplete', detail: raw.slice(-2000) };
    return { latencyMs:Date.now()-started, requestedModel:model, transcript, usage, exitCode: r.status ?? -1, timedOut, incomplete, sessionId: session, modelUsage, turns };
  };
}
