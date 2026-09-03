# Delivery contract: the-suite-total-is-ratcheted

- **Schema:** aidlc.contract/v1
- **Change id:** the-suite-total-is-ratcheted
- **Intent ref:** ../intent-refs/the-suite-total-is-ratcheted.json
- **Story ref:** none
- **Risk:** standard
- **Spec status:** approved
- **Spec approval digest:** sha256:fd0704e17f4bdcf32a0ba6793e04ff7b7119ce7db413fce880615eacfb174276
- **Plan status:** draft
- **Plan approval digest:** pending

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

## Approach and rejected alternatives

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

## Structure and ownership

| Path | Change |
|---|---|
| `.aidlc/lib/eval-gate.mjs` | record and compare a suite total; fall-only; its own finding |
| `.aidlc/bin/harness` | the `evals gate` output names a suite-total finding |
| `evals/expected.json` | gains `usd_total` |
| `test/eval-gate.test.mjs` | B1 to B6 |

## Safeguards

- B1 is the blind spot written as a test, so the gap this closes cannot silently reopen.
- B4 keeps the comparison honest: no total is reported when the sets differ.
- B6 keeps three distinct problems distinguishable in the output.
- The per-task floor and tolerance are untouched, so this adds a dimension rather than retuning
  the existing one.
- The tolerance is a named constant carrying the two measurements it came from, so a later
  revision argues with evidence rather than taste.

## Operations

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
