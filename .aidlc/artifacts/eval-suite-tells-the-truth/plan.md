---
status: draft
migrated_from: sha256:341d510d4c51c1ba79873fc084c7481a9d17eff1c397d88597ffe012d23a608b
---
# Plan: eval-suite-tells-the-truth

## Approach

Read the CLI's own terminal fields (`is_error`, `subtype`, `terminal_reason`, `errors`) in the
invoker, return `incomplete: { reason, detail }`, and thread a third verdict through the runner.

Rejected: raising the two budgets alone. It would turn today's two red rows green and leave the
next budget exhaustion indistinguishable from a real failure — the defect, not the symptom, is
that exhaustion is scored as failure. The budgets are raised *as well*, because a task that
cannot finish cannot be graded, and the raise is recorded here rather than discovered later.

Rejected: deleting the `transcript_matches` assertion from `sensor-consulted`. The task exists to
prove the model consults the sensor; removing the assertion removes the task. Accepting the
check's own rendered output as evidence is strictly more behaviour and less vocabulary.

Rejected: leaving the fixture and asserting `scope-drift` directly in a unit test. That would
prove the function works while every model-facing eval continued to grade the legacy control —
which is the situation being fixed.

## Files

| Path | Change |
|---|---|
| `evals/lib/invoker.mjs` | detect and return budget exhaustion instead of a metadata transcript |
| `evals/run.mjs` | thread an `inconclusive` verdict through runs, summary, and exit code |
| `evals/tasks.json` | `sensor-consulted` accepts the check's output as evidence; raise the two proven-exhausted budgets |
| `evals/fixtures/_base/.aidlc/harness.toml` | `plan-drift` -> `scope-drift`, matching the template |
| `.aidlc/lib/eval-gate.mjs` | `update` refuses to record an inconclusive task |
| `test/invoker.test.mjs` | B1, B2 |
| `test/evals.test.mjs` | B3, B4, and the fixture-matches-template guard |
| `test/eval-gate.test.mjs` | B6 |
| `.aidlc/lib/guard.mjs` | `writeBlocked` matches a prompt-prefix path by identity, not by suffix |
| `test/guard.test.mjs` | B7 — the control has no unit coverage at all today |

## Order

1. `evals/lib/invoker.mjs`: return `incomplete` when `is_error` and no `result`, naming
   `terminal_reason` and `errors`.
2. `evals/run.mjs`: record `incomplete` runs, add the `inconclusive` verdict and summary count,
   and keep the non-zero exit.
3. `.aidlc/lib/eval-gate.mjs`: `update` throws on an inconclusive task.
4. `evals/fixtures/_base/.aidlc/harness.toml`: `plan-drift` -> `scope-drift`.
5. `evals/tasks.json`: widen `sensor-consulted`'s evidence; raise the two exhausted budgets.
6. Tests for B1-B6.
7. `harness check --stage commit`, then re-run the five affected tasks.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/invoker.test.mjs` — an exhausted run is inconclusive, not fail |
| B2 | `test/invoker.test.mjs` — the transcript is not a metadata dump |
| B3 | `test/evals.test.mjs` — pasted check output satisfies `sensor-consulted` |
| B4 | `test/evals.test.mjs` — a transcript with neither command nor output still fails |
| B5 | staged-fixture reproduction: `--stage commit` fails with a `scope-drift` finding |
| B6 | `test/eval-gate.test.mjs` — `update` throws on an inconclusive task |
| B7 | `test/guard.test.mjs` — a nested copy is not the prefix, the repository's own file still is |
