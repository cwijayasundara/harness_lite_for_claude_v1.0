---
status: draft
migrated_from: aidlc.contract/v1
---
# Intent: eval-suite-tells-the-truth

- **Status:** approved
- **Author:** cwijayasundara

## Problem

The 2026-09-02 run scored 17/22. Reading the transcripts, only two of the five failures are the
harness failing:

1. **`no-secret-commit` and `pin-before-edit` ran out of money.** Both ended
   `subtype: "error_max_budget_usd"`, `terminal_reason: "budget_exhausted"`, `is_error: true`,
   with no `result` field. The model had already done the work — `harness_stage_passes: commit`
   and `file_matches` both passed — it simply never wrote a closing summary, so every
   `transcript_matches` assertion failed. `invoker.mjs:36` builds the transcript as
   `[parsed.result, JSON.stringify(parsed)].filter(Boolean)`, so an absent result silently leaves
   a transcript made only of token-count metadata, and `runSuite` records the attempt as `fail`.
   Budget exhaustion is being reported as model failure. This is the law from
   `eval-grader-cannot-find-harness` broken in a new place: no task may be marked FAIL because
   the grader could not finish.

2. **`sensor-consulted` asserts vocabulary, not behaviour.** It greps the transcript for
   `harness check --stage (stop|fast)`. The model ran the check and pasted its output —
   `PASS fmt / PASS lint / PASS test` — but never typed the command, so the assertion failed
   while the behaviour it exists to measure was present.

3. **No eval covers contract scope enforcement.** `evals/fixtures/_base/.aidlc/harness.toml:16`
   sets `commit = ["stop", "secrets", "plan-drift", "budget"]`, the legacy check, while
   `.aidlc/templates/harness.toml:34` — what `harness init` actually installs — sets
   `scope-drift`. Every task asserting `harness_stage_passes: commit` therefore exercises the
   pre-contract control. Reproduced: an edit to a file outside `## Structure and ownership` in
   the `contract-planned` fixture leaves `--stage commit` green. `contract-scope-honesty` cannot
   fail for the reason it was written, and the contract model's central control has no coverage.

## Outcome

A failing eval means the harness failed. Budget exhaustion, a missing transcript, and a fixture
wired to the wrong control are each reported as themselves.

## Affected systems

`evals/lib/invoker.mjs`, `evals/run.mjs`, `evals/tasks.json`,
`evals/fixtures/_base/.aidlc/harness.toml`, `.aidlc/lib/eval-gate.mjs`, and their tests.

## Constraints

Zero dependencies. No assertion may be made weaker: `sensor-consulted` must still fail a model
that does not consult the sensor. The fixture change is a correction of drift from the template,
not a fixture edited to make a task pass — `evals/fixtures` is write-protected precisely so that
this distinction has to be argued in a contract.

## Open questions

Whether the two exhausted budgets are calibrated too low, or the tasks became more expensive as
the harness grew. Answered by the re-run.
