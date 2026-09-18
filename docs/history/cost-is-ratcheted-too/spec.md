---
status: draft
migrated_from: sha256:ce913a0f74f87ccb4ddf92ec76184430c789d4a56e14634468e4cf9d0521c55b
---
# Spec: cost-is-ratcheted-too

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

## Safeguards

- B7 pins the verdict ratchet across the change, so adding a second dimension does not loosen the
  first.
- B4 is the ratchet's teeth: a floor that only falls is the difference between measuring drift and
  following it.
- B6 keeps cost and behaviour separable in the output, so a costly pass is not mistaken for a
  failure.
- B8 keeps an older record readable, so this does not strand a repository mid-upgrade.
- The tolerance is a named constant with the measured spread beside it, not a bare number.

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
