---
status: draft
migrated_from: sha256:05c848d43fb0db583c59f769825defe139d0e02fd73445d15e0e6c02d40ed671
---
# Plan: overlay-narrow-eval-runs

## Approach

`loadResults` keeps the widest run as its base, then walks every results file whose name sorts
after that base, overlaying verdicts for ids the base already contains. It returns the merged
verdict set plus `sources`, oldest first.

Rejected: letting `--update` take an explicit `--results <file>`. It puts the choice of what to
record in the hands of whoever types the command, which is exactly the discretion a ratchet
exists to remove.

Rejected: making the newest run win outright rather than the widest. That is the rule
`eval-ratchet` deliberately avoided — a one-task smoke run would silently become the baseline.

Rejected: recording `inconclusive` into the record as a pending state. It reads as a floor of
"unknown", and the next comparison against it means nothing in either direction.

## Files

| Path | Change |
|---|---|
| `.aidlc/lib/eval-gate.mjs` | `loadResults` overlays newer narrow runs and reports `sources` |
| `.aidlc/bin/harness` | `evals gate` reports how many runs a record was assembled from |
| `evals/tasks.json` | `contract-is-testable` and `budget-forces-deletion` raised to 2.0 |
| `test/eval-gate.test.mjs` | B1 to B6 |

## Order

1. In `.aidlc/lib/eval-gate.mjs`, extend `loadResults` to overlay newer files over the widest
   base, restricted to ids already present, returning `sources`.
2. Carry `sources` into the record written by `update`.
3. Report the source count in the `evals gate` subcommand output.
4. Raise the two budgets in `evals/tasks.json` to 2.0.
5. Add B1 to B6 to `test/eval-gate.test.mjs`.
6. `harness check --stage commit`, then re-run the two tasks and record.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/eval-gate.test.mjs` — a later narrow pass overlays an inconclusive |
| B2 | `test/eval-gate.test.mjs` — `sources` names both files, newest last |
| B3 | `test/eval-gate.test.mjs` — an older narrow run is ignored |
| B4 | `test/eval-gate.test.mjs` — an unknown id in a narrow run is not introduced |
| B5 | `test/eval-gate.test.mjs` — a still-inconclusive task still refuses to record |
| B6 | `test/eval-gate.test.mjs` — a lone widest run behaves as before |
