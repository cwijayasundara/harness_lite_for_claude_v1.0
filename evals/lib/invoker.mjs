// The real invoker. It is injected rather than imported by the runner, so the runner and the
// assertion engine are unit-testable with no model, no key and no spend.
import { spawnSync } from 'node:child_process';

// lean-v2 B12. `model` comes from `[models] evals` — Haiku 4.5 — and is cheap on purpose. What
// the suite measures is whether the *harness* steers a model to the right answer; running a
// frontier model here would flatter the guides and price the suite out of running on every
// steering change, which is the one trigger Law 9 actually requires.
// The argument list, as a pure function, so the unit suite can read it without spawning.
export function invokerArgs({ prompt, model = null, pluginDir = null, budgetUsd = null }) {
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

// The child's environment, as a pure function. close-the-harness B2: no eval task has a human,
// so every task carries AIDLC_EVAL and the approve-is-the-humans rule stands down for it;
// AIDLC_UNATTENDED stays the campaign-only signal (see the comment in `invoke`), set for steps
// and stripped for everything else.
export function invokerEnv({ task, pluginDir = null, base = {} }) {
  const env = { ...base, ...(pluginDir ? { HARNESS_HOME: pluginDir } : {}), AIDLC_EVAL: '1' };
  if (task?.steps) env.AIDLC_UNATTENDED = '1';
  else delete env.AIDLC_UNATTENDED;
  return env;
}

export function claudeInvoker({ pluginDir, model = null }) {
  return function invoke({ prompt, cwd, timeoutMs, budgetUsd, task }) {
    const args = invokerArgs({ prompt, model, pluginDir, budgetUsd });
    // campaigns-run-unattended B3, B4. The signal a staged working copy can never produce: set
    // here, by the runner, on the `claude` process's own env — never read from `harness.toml` or
    // any path under `cwd`. See `.aidlc/lib/artifacts.mjs` `approve()`.
    //
    // Scoped to a campaign step only (`task.steps` present) — review `1ace6a8` (Blocking 1): set
    // unconditionally, this reached all 22 single-prompt golden tasks too, several of them
    // artifact- or contract-shaped, with context the golden suite was never calibrated against.
    // A single-prompt task must run exactly as it does for a real, attended repository.
    //
    // Stripped, not merely not-added — review `419c0a4` (Blocking 2): `...process.env` is spread
    // first, so an operator's own `AIDLC_UNATTENDED` survived a single-prompt task untouched.
    // `delete` rather than assigning `undefined`: measured, Node omits an `undefined` value from
    // the child's environment, so both happen to work today. `delete` says what is meant and does
    // not rest on that detail — the earlier comment here claimed the assignment would arrive as
    // the string `"undefined"`, which the confirming pass on `d668876` disproved.
    const env = invokerEnv({ task, pluginDir, base: process.env });
    const r = spawnSync('claude', args, { cwd, env, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
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
    let incomplete = null;
    try {
      const parsed = JSON.parse(r.stdout);
      transcript = [parsed.result, JSON.stringify(parsed)].filter(Boolean).join('\n');
      usage = { usd: parsed.total_cost_usd, output_tokens: parsed.usage?.output_tokens };
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
    return { transcript, usage, exitCode: r.status ?? -1, timedOut, incomplete };
  };
}
