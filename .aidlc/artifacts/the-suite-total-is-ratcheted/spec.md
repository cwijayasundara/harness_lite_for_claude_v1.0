---
status: draft
migrated_from: sha256:fd0704e17f4bdcf32a0ba6793e04ff7b7119ce7db413fce880615eacfb174276
---
# Spec: the-suite-total-is-ratcheted

## Outcome

The suite cannot get materially more expensive while every individual task stays inside its own
tolerance.

## Observable behaviours

### B1

Given twenty-two tasks each recorded at a floor, and a run in which every task grows 40% — inside
the `1.5x` per-task bound,
When `harness evals gate` runs,
Then it fails on the suite total. This is the blind spot, stated as a test.

### B2

Given a run whose total is within `1.25x` the recorded total,
When the gate runs,
Then it passes on cost. Like-for-like full runs have measured 9% apart.

### B3

Given a cheaper total,
When `--update` runs,
Then the recorded total falls to it. A dearer total leaves it unchanged, for the same reason the
per-task floor only falls.

### B4

Given a run grading a different set of tasks from the record,
When the gate runs,
Then it reports the set mismatch and does not report a total comparison. An incomparable total is
worse than none.

### B5

Given a record with no recorded total,
When the gate runs,
Then it passes on the total and `--update` records one. An older record is not an error.

### B6

Given a suite-total finding,
When the gate reports,
Then it is distinguishable from a per-task cost finding and from a verdict regression: three
different problems, three different lines.

## Out of scope

Normalising cost per task rather than summing — recorded as the intent's open question, and it
matters the moment a twenty-third task is added. The per-task floor and its `1.5x`, unchanged.
`budgetUsd`.

## Safeguards

- B1 is the blind spot written as a test, so the gap this closes cannot silently reopen.
- B4 keeps the comparison honest: no total is reported when the sets differ.
- B6 keeps three distinct problems distinguishable in the output.
- The per-task floor and tolerance are untouched, so this adds a dimension rather than retuning
  the existing one.
- The tolerance is a named constant carrying the two measurements it came from, so a later
  revision argues with evidence rather than taste.

## Entities and existing context

- `COST_TOLERANCE` (`.aidlc/lib/eval-gate.mjs`) — `1.5`, per task, set from a 0.858–1.208 spread.
- `gate` — already returns `regressed`, `improved`, `missing`, `unrecorded`, `costly`. The suite
  total is a sixth finding, not an entry in `costly`.
- `update` — records the minimum per-task cost. The total follows the same fall-only rule.
- The set-equality checks (`missing`, `unrecorded`) already guarantee comparability: if the graded
  set differs from the record, the gate has already failed, so a total is only compared when the
  two sets match. B4 is that property made explicit rather than new logic.
- Measured comparable totals: `$12.31` and `$13.40`, 9% apart, both 22 tasks at `--repeats 1`.
  `$18.94` is not comparable — repeats of three, and five failures each burning a full budget.
