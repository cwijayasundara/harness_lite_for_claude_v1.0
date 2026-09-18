---
status: draft
migrated_from: sha256:c54e874ad7b88ce7dab433fb7b51e0b865a0c1bc7c00ebe8e282453c7ad9fefe
---
# Plan: the-suite-total-is-ratcheted

## Approach

Record a `usd_total` beside `tasks`, compare the run's total against it at `1.25x`, and let it
fall only. Report it as its own finding.

Rejected: tightening the per-task tolerance instead. It would fire on noise — identical work
measured 40% apart — and a bound that cries wolf is one people learn to ignore, which is worse
than no bound.

Rejected: a mean rather than a sum. A mean survives adding a task, which is the open question's
appeal, but it also hides one expensive task among many cheap ones — and that is exactly what the
per-task floor is for, so the sum is the honest complement.

Rejected: comparing totals across differing task sets by intersecting them. The intersection of
two sets is not the suite, and the gate already refuses a set mismatch outright.

Rejected: a tolerance tighter than `1.25x`. Two comparable runs is thin evidence; 9% observed with
25% allowed leaves room for a third run to be worse than both without crying wolf.

## Files

| Path | Change |
|---|---|
| `.aidlc/lib/eval-gate.mjs` | record and compare a suite total; fall-only; its own finding |
| `.aidlc/bin/harness` | the `evals gate` output names a suite-total finding |
| `evals/expected.json` | gains `usd_total` |
| `test/eval-gate.test.mjs` | B1 to B6 |

## Order

1. Add `SUITE_COST_TOLERANCE = 1.25` and a `usd_total` to the record in `.aidlc/lib/eval-gate.mjs`.
2. Compare the run's total against it, only when the task sets match, and report it separately.
3. Apply the fall-only rule in `update`.
4. Render the finding in `.aidlc/bin/harness`.
5. Add B1 to B6 to `test/eval-gate.test.mjs`.
6. `harness check --stage commit`, then `harness evals gate --update` and `harness evals gate`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/eval-gate.test.mjs` — every task inside tolerance, suite total over it, gate fails |
| B2 | `test/eval-gate.test.mjs` — a total inside `1.25x` passes |
| B3 | `test/eval-gate.test.mjs` — the total falls on a cheaper run and holds on a dearer one |
| B4 | `test/eval-gate.test.mjs` — a set mismatch reports no total comparison |
| B5 | `test/eval-gate.test.mjs` — a record with no total passes and gains one |
| B6 | `test/eval-gate.test.mjs` — the three finding kinds are separate |
