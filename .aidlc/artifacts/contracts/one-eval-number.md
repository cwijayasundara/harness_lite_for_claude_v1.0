# Delivery contract: one-eval-number

- **Schema:** aidlc.contract/v1
- **Change id:** one-eval-number
- **Intent ref:** ../intent-refs/one-eval-number.json
- **Story ref:** none
- **Risk:** low
- **Spec status:** draft
- **Spec approval digest:** pending
- **Plan status:** draft
- **Plan approval digest:** pending

## Outcome

The board and the gate read the eval results the same way.

## Observable behaviours

### B1

Given a widest run and a later narrow run that corrects one task,
When the status board's eval pass rate and the gate's verdicts are computed,
Then both reflect the correction.

### B2

Given this repository,
When `harness status` runs,
Then `eval pass rate` reads `22/22 (1)`, the same set of verdicts `harness evals gate` reports.

### B3

Given a widest run and a later *narrower* run covering fewer tasks,
When the board's rate is computed,
Then the denominator is still the widest run's task count. A smoke run corrects verdicts; it does
not become the score.

### B4

Given no results at all,
When the board's rate is computed,
Then it reads `unmeasured`, exactly as today.

### B5

Given the two modules,
When their imports are read,
Then the shared reader lives in `indicators.mjs` and `eval-gate.mjs` consumes it. There is one
implementation of "which results count", not two that must agree.

## Out of scope

Showing the run count on the board — recorded as the intent's open question. Any change to how the
widest run is chosen, or to the overlay rules `overlay-narrow-eval-runs` established. The eval
cost ratchet, which is its own change.

## Entities and existing context

- `latestEval` (`.aidlc/lib/indicators.mjs`) — reads `widestResults` alone; the board's number.
- `loadResults` (`.aidlc/lib/eval-gate.mjs`) — reads `widestResults` then overlays later runs,
  restricted to ids the base graded, forward in time only.
- `widestResults` (`.aidlc/lib/indicators.mjs`) — max task count, then lexicographically last.
  Unchanged.
- `eval-gate.mjs` already imports from `indicators.mjs`, so the shared reader belongs in
  `indicators.mjs` or the two import each other.

## Approach and rejected alternatives

Move `loadResults` into `indicators.mjs` beside `widestResults`, and have both `latestEval` and
`eval-gate.mjs` call it. One function, two callers.

Rejected: teaching `latestEval` to overlay separately. That is two implementations of the same
rule, which is the defect being fixed rather than a fix for it.

Rejected: dropping the overlay and having the gate read only the widest run. It would undo
`overlay-narrow-eval-runs` and put repairing one task back at the price of a full suite.

Rejected: having `indicators.mjs` import from `eval-gate.mjs`. The dependency already runs the
other way; reversing it makes a cycle.

## Structure and ownership

| Path | Change |
|---|---|
| `.aidlc/lib/indicators.mjs` | hosts the overlay reader; `latestEval` uses it |
| `.aidlc/lib/eval-gate.mjs` | imports the reader rather than defining one |
| `test/eval-gate.test.mjs` | B1, B3, B4, B5 |

## Safeguards

- B3 keeps the widest run as the denominator, so a one-task re-run cannot make the board read
  `1/1`.
- B5 is the point: one implementation, not two that agree today and drift tomorrow.
- The overlay rules are moved, not rewritten — the existing `overlay-narrow-eval-runs` tests
  continue to pass against the relocated function.
- `widestResults` is untouched, so which run is the base does not change.

## Operations

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
