---
status: draft
migrated_from: sha256:6f472dc1b68812b9a56e0c596739301f17529000dc3027d9d3512d822d116e83
---
# Plan: cost-is-ratcheted-too

## Approach

A task entry becomes `{ verdict, usd }` instead of a bare verdict string, and the schema version
moves to `v2`. `update` keeps the raise-only rule for the verdict and applies a fall-only rule to
the cost. `gate` adds a `costly` list, separate from `regressed`.

Rejected: recording the latest observed cost. Every step of `budget-forces-deletion`'s climb from
0.184 to 0.991 was small against the step before it. A floor that follows the last run cannot see
a trend, which is the whole defect.

Rejected: a parallel `costs` map beside `tasks`. Two maps keyed the same way must be kept in
step, and this repository has spent a session finding defects of exactly that shape.

Rejected: a per-task `under_baseline` assertion on `usd`. It would make cost a task *verdict*, so
a behavioural pass and a cost regression become the same red — B6 exists because they are
different problems.

Rejected: tightening the tolerance below 1.5x. Identical work has been measured 40% apart; a bound
inside the noise fires on nothing real and gets ignored, which is worse than no bound.

## Files

| Path | Change |
|---|---|
| `.aidlc/lib/eval-gate.mjs` | task entries carry a cost floor; `gate` reports `costly`; `update` is fall-only on cost |
| `.aidlc/bin/harness` | the `evals gate` output names cost findings |
| `evals/expected.json` | migrated to `v2` with floors from the recorded runs |
| `test/eval-gate.test.mjs` | B1 to B8 |

## Order

1. Move task entries to `{ verdict, usd }` in `.aidlc/lib/eval-gate.mjs`, bump `RECORD_SCHEMA` to
   `v2`, and read `v1` entries as verdict-only.
2. Add the fall-only cost rule to `update`.
3. Add the `costly` list to `gate` and render it in `.aidlc/bin/harness`.
4. Migrate `evals/expected.json` by re-recording from the runs already on disk.
5. Add B1 to B8 to `test/eval-gate.test.mjs`.
6. `harness check --stage commit`, then `harness evals gate`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/eval-gate.test.mjs` — a run over tolerance fails, naming floor and observed |
| B2 | `test/eval-gate.test.mjs` — a run inside tolerance passes |
| B3 | `test/eval-gate.test.mjs` — a cheaper run lowers the floor |
| B4 | `test/eval-gate.test.mjs` — a dearer run within tolerance leaves it |
| B5 | `test/eval-gate.test.mjs` — a new task records its observed cost |
| B6 | `test/eval-gate.test.mjs` — a cost finding is not a verdict regression |
| B7 | `test/eval-gate.test.mjs` — the existing verdict-ratchet tests, unchanged |
| B8 | `test/eval-gate.test.mjs` — a v1 record loads without floors |
