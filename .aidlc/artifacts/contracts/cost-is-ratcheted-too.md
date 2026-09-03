# Delivery contract: cost-is-ratcheted-too

- **Schema:** aidlc.contract/v1
- **Change id:** cost-is-ratcheted-too
- **Intent ref:** ../intent-refs/cost-is-ratcheted-too.json
- **Story ref:** none
- **Risk:** standard
- **Spec status:** approved
- **Spec approval digest:** sha256:ce913a0f74f87ccb4ddf92ec76184430c789d4a56e14634468e4cf9d0521c55b
- **Plan status:** draft
- **Plan approval digest:** pending

## Outcome

A task that gets materially more expensive fails the gate, and its floor falls only by running
cheaper.

## Observable behaviours

### B1

Given a task with a recorded cost floor,
When it runs at more than `1.5x` that floor,
Then `harness evals gate` fails, naming the task, the floor and the observed cost.

### B2

Given the same task,
When it runs at or under `1.5x` the floor,
Then the gate passes on cost. The bound absorbs real noise: identical work has been observed
between 0.858 and 1.208.

### B3

Given a recorded floor and a cheaper run,
When `harness evals gate --update` runs,
Then the floor becomes the cheaper figure.

### B4

Given a recorded floor and a more expensive run that is still within tolerance,
When `--update` runs,
Then the floor is unchanged. Recording the latest would let a floor climb step by step, which is
how a five-fold rise went unnoticed.

### B5

Given a task with no recorded floor,
When `--update` runs,
Then its observed cost becomes the initial floor.

### B6

Given a cost regression and no verdict regression,
When the gate reports,
Then the finding says the task is more expensive, not that it failed. A task that behaves
correctly and costs too much has one problem, not two.

### B7

Given the verdict ratchet,
When cost recording is added,
Then it is unchanged: `fail -> pass` still records, `pass -> fail` still refuses, and an
inconclusive task is still not recorded.

### B8

Given a record written before cost was tracked,
When it is read,
Then it loads, and its tasks simply have no floor until the next `--update`. An older record is
not an error.

## Out of scope

Investigating *why* tasks are getting more expensive — the intent names the likely cause and
leaves it. Moving the tolerance into `harness.toml`, recorded as the intent's open question.
`budgetUsd`, which is a per-run cap and a different instrument. `evals/baseline.json` and
`under_baseline`, which stay as they are.

## Entities and existing context

- `evals/expected.json` — `tasks` maps id to a verdict string today. It already carries the
  ratchet discipline: raise-only `--update`, refusal on inconclusive, `sources` provenance.
- `update` (`.aidlc/lib/eval-gate.mjs`) — refuses to lower a verdict and refuses inconclusive
  tasks. Cost recording joins it rather than becoming a second mechanism.
- `gate` (`.aidlc/lib/eval-gate.mjs`) — returns `regressed`, `improved`, `missing`, `unrecorded`.
  Cost findings are a fifth list, not entries in `regressed`.
- Results files carry `usd` per task, so no new measurement is needed — only recording it.
- `RECORD_SCHEMA` — `aidlc.eval-expectation/v1`. The task entry shape changes, so the version
  moves with it.
- Measured spread: `contract-scope-honesty` 0.858 to 1.208 across runs of identical work. That
  spread is what sets the tolerance.

## Approach and rejected alternatives

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

## Structure and ownership

| Path | Change |
|---|---|
| `.aidlc/lib/eval-gate.mjs` | task entries carry a cost floor; `gate` reports `costly`; `update` is fall-only on cost |
| `.aidlc/bin/harness` | the `evals gate` output names cost findings |
| `evals/expected.json` | migrated to `v2` with floors from the recorded runs |
| `test/eval-gate.test.mjs` | B1 to B8 |

## Safeguards

- B7 pins the verdict ratchet across the change, so adding a second dimension does not loosen the
  first.
- B4 is the ratchet's teeth: a floor that only falls is the difference between measuring drift and
  following it.
- B6 keeps cost and behaviour separable in the output, so a costly pass is not mistaken for a
  failure.
- B8 keeps an older record readable, so this does not strand a repository mid-upgrade.
- The tolerance is a named constant with the measured spread beside it, not a bare number.

## Operations

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
