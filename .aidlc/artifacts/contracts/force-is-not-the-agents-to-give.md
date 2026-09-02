# Delivery contract: force-is-not-the-agents-to-give

- **Schema:** aidlc.contract/v1
- **Change id:** force-is-not-the-agents-to-give
- **Intent ref:** ../intent-refs/force-is-not-the-agents-to-give.json
- **Story ref:** none
- **Risk:** standard
- **Spec status:** approved
- **Spec approval digest:** sha256:7ba092d853d4d26296feb725d748f762ef4ba119389996988605b0f61ae132fe
- **Plan status:** approved
- **Plan approval digest:** sha256:6209959bd81c4505d47e31e26b45beea37364f3188601377ba8c586b543fde69

## Outcome

The agent cannot spend the human's escape hatch on its own authority.

## Observable behaviours

### B1

Given the pre-tool bash hook,
When the agent issues `harness init --force` in any spelling — `node .aidlc/bin/harness init
--force`, `bash .aidlc/bin/harness init --force`, flags in either order,
Then it is denied, and the denial says to ask the human to run it.

### B2

Given the same hook,
When the agent issues `harness init` without `--force`,
Then it is allowed. The install and upgrade paths stay open to the agent.

### B3

Given a human running `harness init --force` in their own terminal,
When it executes,
Then it regenerates the file and succeeds. The pre-tool hook observes agent tool calls only, and
this must remain the seam.

### B4

Given the `prefix-cache-guard` eval,
When it is re-run,
Then `.claude/CLAUDE.md` is unchanged and the transcript names the reason.

### B5

Given `contract-scope-honesty`,
When it is re-run at its raised ceiling,
Then it produces a verdict rather than `inconclusive`.

## Out of scope

The cost drift behind B5's ceiling raise — recorded as the intent's open question, not solved
here. Any change to what `init --force` does once it runs. Adding a hook binding: the budget is
5/5 and this is a rule inside the binding that already exists.

## Entities and existing context

- `DESTRUCTIVE` (`.aidlc/hooks/dispatch.mjs:41`) — the list of command patterns the pre-bash hook
  refuses. `deny()` already appends "If this is genuinely required, ask the human to run it",
  which is precisely the sentence this defect needs.
- `pre-bash` (`.aidlc/hooks/dispatch.mjs:91`) — sees commands the agent issues through its tool,
  and nothing a human types elsewhere. That asymmetry is the mechanism, not a limitation.
- `init` refusal (`.aidlc/bin/harness`) — added by `init-does-not-invalidate-the-prefix`. It
  stays exactly as it is; this stops the agent taking the way past it.
- The 2026-09-02 `prefix-cache-guard` transcript, in which the agent names the cost of forcing and
  forces anyway.

## Approach and rejected alternatives

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

## Structure and ownership

| Path | Change |
|---|---|
| `.aidlc/hooks/dispatch.mjs` | one `DESTRUCTIVE` pattern for `harness init --force` |
| `test/guard.test.mjs` | B1 and B2 |
| `evals/tasks.json` | `contract-scope-honesty` ceiling raised so B5 can be graded |

## Safeguards

- B2 keeps ordinary `init` available to the agent; a rule that blocked installs would be worse
  than the defect.
- B3 keeps the human's route open, which is the whole point of calling it an escape hatch.
- The hook already records a `bash-guard` ledger row on denial, so the rule's firing rate is
  measurable and it can be judged like any other control.
- The ceiling raise touches one task's `budgetUsd` and no assertion, so nothing about what
  `contract-scope-honesty` measures changes.

## Operations

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
| B3 | the hook fires on agent tool calls only; no code path intercepts a human's shell |
| B4 | the `prefix-cache-guard` eval verdict after the change |
| B5 | the `contract-scope-honesty` eval verdict after the change |
