---
status: draft
migrated_from: sha256:0208cf6ae77615ba93205ccb7a4863559616c48eaf5f994ff259359dc05a1feb
---
# Plan: one-eval-number

## Approach

Move `loadResults` into `indicators.mjs` beside `widestResults`, and have both `latestEval` and
`eval-gate.mjs` call it. One function, two callers.

Rejected: teaching `latestEval` to overlay separately. That is two implementations of the same
rule, which is the defect being fixed rather than a fix for it.

Rejected: dropping the overlay and having the gate read only the widest run. It would undo
`overlay-narrow-eval-runs` and put repairing one task back at the price of a full suite.

Rejected: having `indicators.mjs` import from `eval-gate.mjs`. The dependency already runs the
other way; reversing it makes a cycle.

## Files

| Path | Change |
|---|---|
| `.aidlc/lib/indicators.mjs` | hosts the overlay reader; `latestEval` uses it |
| `.aidlc/lib/eval-gate.mjs` | imports the reader rather than defining one |
| `test/eval-gate.test.mjs` | B1, B3, B4, B5 |

## Order

1. Move `loadResults` from `eval-gate.mjs` into `indicators.mjs`, exported.
2. Point `latestEval` at it, keeping the widest run's task count as the denominator.
3. Import it in `eval-gate.mjs`.
4. Add B1, B3, B4, B5 to `test/eval-gate.test.mjs`.
5. `harness check --stage commit`, then read `harness status` for B2.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/eval-gate.test.mjs` — a correction shows in both readings |
| B2 | `harness status` reads `eval pass rate 22/22 (1)` |
| B3 | `test/eval-gate.test.mjs` — a narrower later run does not shrink the denominator |
| B4 | `test/eval-gate.test.mjs` — no results reads unmeasured |
| B5 | `test/eval-gate.test.mjs` — the gate's reader is the indicator's reader |
