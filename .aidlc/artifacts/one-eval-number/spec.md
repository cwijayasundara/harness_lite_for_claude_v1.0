---
status: draft
migrated_from: sha256:18384cd3892e2ad6a6790f6f5e71728a157b084bf3efcdbab130fc2e3576482b
---
# Spec: one-eval-number

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

## Safeguards

- B3 keeps the widest run as the denominator, so a one-task re-run cannot make the board read
  `1/1`.
- B5 is the point: one implementation, not two that agree today and drift tomorrow.
- The overlay rules are moved, not rewritten — the existing `overlay-narrow-eval-runs` tests
  continue to pass against the relocated function.
- `widestResults` is untouched, so which run is the base does not change.

## Entities and existing context

- `latestEval` (`.aidlc/lib/indicators.mjs`) — reads `widestResults` alone; the board's number.
- `loadResults` (`.aidlc/lib/eval-gate.mjs`) — reads `widestResults` then overlays later runs,
  restricted to ids the base graded, forward in time only.
- `widestResults` (`.aidlc/lib/indicators.mjs`) — max task count, then lexicographically last.
  Unchanged.
- `eval-gate.mjs` already imports from `indicators.mjs`, so the shared reader belongs in
  `indicators.mjs` or the two import each other.
