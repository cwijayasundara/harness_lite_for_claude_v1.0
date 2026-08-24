// The real invoker. It is injected rather than imported by the runner, so the runner and the
// assertion engine are unit-testable with no model, no key and no spend.
import { spawnSync } from 'node:child_process';

export function claudeInvoker({ pluginDir }) {
  return function invoke({ prompt, cwd, timeoutMs, budgetUsd }) {
    const args = [
      '-p', prompt,
      // Evals run against a disposable copy in mkdtemp, so permission prompts measure the CLI
      // rather than the guides. MEASURED: under `acceptEdits` the model's own skills told it to
      // run `.claude/bin/harness` and to write `.claude/artifacts/...`, and both were denied —
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
    const r = spawnSync('claude', args, { cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
    // A missing CLI is not a failed task — it is a broken harness, and twenty tasks failing
    // with empty transcripts is the least useful way to say so. Same lesson as exit 127 in the
    // check runner: never let an absent tool masquerade as a verdict.
    if (r.error?.code === 'ENOENT') {
      return { notInstalled: true, transcript: '', usage: {}, exitCode: -1, error: 'the `claude` CLI is not on PATH' };
    }
    const timedOut = r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM';
    const raw = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    let usage = {};
    let transcript = raw;
    try {
      const parsed = JSON.parse(r.stdout);
      transcript = [parsed.result, JSON.stringify(parsed)].filter(Boolean).join('\n');
      usage = { usd: parsed.total_cost_usd, output_tokens: parsed.usage?.output_tokens };
      const denied = (parsed.permission_denials ?? []).map((d) => d.tool_input?.command ?? d.tool_name);
      if (denied.length) transcript = `[permission denied: ${denied.join(' | ')}]\n${transcript}`;
    } catch { /* not JSON: grade the raw transcript, which is still honest */ }
    return { transcript, usage, exitCode: r.status ?? -1, timedOut };
  };
}
