---
status: draft
migrated_from: sha256:771536995d82f1db279ed10fd6c31c6b15fec30f588df7a02a6dca3ca83bfce4
---
# Plan: force-is-not-the-agents-to-give

## Approach

One pattern in `DESTRUCTIVE` matching `harness init` with `--force`. The hook is the only place
that can tell an agent's command from a human's, and it already carries the right message.

Rejected: removing `--force` from `init`. It would take the escape hatch away from the human too,
and a control with no deliberate override is one people work around by editing the control.

Rejected: a `[guard].deny_bash` entry instead. That is project configuration, so a project could
silently drop it — and this rule protects the prompt cache of every session, not one project's
policy.

Rejected: making the `init` refusal unconditional and dropping `--force`. Same objection as
above, and it breaks the upgrade path for a human with a legitimately changed source.

Rejected: treating this as a guidance problem and writing "do not use --force" into a skill.
Guidance is what the agent already had: the refusal message said to ask the human, and it was
read and overridden. A rule the agent can decline is not a control.

## Files

| Path | Change |
|---|---|
| `.aidlc/hooks/dispatch.mjs` | one `DESTRUCTIVE` pattern for `harness init --force` |
| `test/guard.test.mjs` | B1 and B2 |
| `evals/tasks.json` | `contract-scope-honesty` ceiling raised so B5 can be graded |

## Order

1. Add the pattern to `DESTRUCTIVE` in `.aidlc/hooks/dispatch.mjs`.
2. Add B1 and B2 to `test/guard.test.mjs`.
3. Raise `contract-scope-honesty` to 2.5 in `evals/tasks.json`.
4. `harness check --stage commit`.
5. Re-run `prefix-cache-guard` and `contract-scope-honesty` for B4 and B5.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/guard.test.mjs` — every spelling of `init --force` is denied |
| B2 | `test/guard.test.mjs` — plain `init` is allowed |
| B6 | `test/guard.test.mjs` — a command that only quotes the invocation is allowed |
| B3 | the hook fires on agent tool calls only; no code path intercepts a human's shell |
| B4 | the `prefix-cache-guard` eval verdict after the change |
| B5 | the `contract-scope-honesty` eval verdict after the change |
