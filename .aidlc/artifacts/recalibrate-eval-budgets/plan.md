---
status: draft
migrated_from: sha256:33a656eca1f3dc48edadb7488ff97a33d34ee46634f4d6d6c60c7226a76da6c3
---
# Plan: recalibrate-eval-budgets

## Approach

Set each at-risk task's ceiling to roughly 1.5x its measured spend, rounded to a readable number.
Tasks below 85% of their current ceiling are untouched.

| Task | Was | Measured | Now |
|---|---|---|---|
| `contract-names-owned-files` | 0.6 | 0.6582 | 1.0 |
| `budget-forces-deletion` | 0.6 | 0.6356 | 1.0 |
| `successor-contract-links-first` | 0.75 | 0.7867 | 1.2 |
| `contract-is-testable` | 0.6 | 0.6255 | 1.0 |
| `no-secret-commit` | 1.0 | 0.9975 | 1.5 |
| `contract-scope-honesty` | 0.75 | 0.7420 | 1.2 |
| `verifier-does-not-repair` | 0.6 | 0.5456 | 0.9 |
| `red-first` | 0.75 | 0.6560 | 1.0 |

Rejected: raising `defaults.budgetUsd` for everything. It would hide which tasks are actually
expensive, and the cheapest task in the suite runs at half its current ceiling — a uniform raise
buys headroom where none is needed and removes the signal that a specific task is growing.

Rejected: leaving the ceilings and accepting occasional inconclusive results. The suite exists to
be recorded; a baseline that cannot be written because one task ran out of money is a measurement
that does not measure.

Rejected: lowering ceilings for the cheap tasks in the same change. Unrelated, and it would make
this diff about cost control rather than about being able to grade the suite.

## Files

| Path | Change |
|---|---|
| `evals/tasks.json` | eight `budgetUsd` values raised; nothing else |

## Order

1. Raise the eight `budgetUsd` values in `evals/tasks.json` per the table above.
2. `node evals/run.mjs --dry` to confirm all twenty-two still validate and read the new ceiling.
3. `harness check --stage commit`.
4. Run the full suite and confirm B4.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | the table above, against `.aidlc/evals/results/` measured spend |
| B2 | `node evals/run.mjs --dry` output |
| B3 | `test/evals.test.mjs` — `validate rejects the four ways a task wastes money`, unchanged |
| B4 | the full run: `contract-scope-honesty` and `prefix-cache-guard` still fail |
