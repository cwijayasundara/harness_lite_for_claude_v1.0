# Delivery contract: recalibrate-eval-budgets

- **Schema:** aidlc.contract/v1
- **Change id:** recalibrate-eval-budgets
- **Intent ref:** ../intent-refs/recalibrate-eval-budgets.json
- **Story ref:** none
- **Risk:** low
- **Spec status:** approved
- **Spec approval digest:** sha256:2bad8492ab3fe2cc91bf84e72a4f39232e71690b6c3062cfe668bd533c6c4b62
- **Plan status:** draft
- **Plan approval digest:** pending

## Outcome

A full suite run grades all twenty-two tasks, so `harness evals gate --update` has something to
record.

## Observable behaviours

### B1

Given the measured spend of every task in the 2026-09-02 runs,
When each task's ceiling is read,
Then no ceiling is below 1.4x that task's measured spend.

### B2

Given the raised ceilings,
When `node evals/run.mjs --dry` runs,
Then all twenty-two tasks validate and the printed ceiling is the new total.

### B3

Given a task with no ceiling at all,
When `validate` runs,
Then it is still rejected. This change raises ceilings; it does not remove the requirement to
have one.

### B4

Given the raised ceilings,
When the suite is re-run,
Then `contract-scope-honesty` and `prefix-cache-guard` still fail. A ceiling is a spend cap, not
a correctness assertion, and raising one must not turn a failing task green.

## Out of scope

Any change to a prompt, an assertion, a fixture, or a repeats count. Making suite cost itself an
indicator — noted in the intent, not done here. `contract-scope-honesty` and `prefix-cache-guard`
themselves, which are real defects with their own queue position.

## Entities and existing context

- `evals/tasks.json` `defaults.budgetUsd` — the 0.75 fallback for tasks that name no ceiling.
- `validate` (`evals/run.mjs:99`) — `if (!(t.budgetUsd > 0)) problems.push('no USD ceiling — an
  unbounded task is not a task')`. B3 is this rule, unchanged.
- `--max-budget-usd` — enforced by the CLI between turns, which is why four tasks recorded spend
  above their ceiling and still completed.
- `incomplete` / `inconclusive` (`evals/lib/invoker.mjs`, `evals/run.mjs`) — added by
  `eval-suite-tells-the-truth`. Exhaustion is no longer silently a `fail`, which is what makes
  this recalibration necessary rather than cosmetic.
- `update` (`.aidlc/lib/eval-gate.mjs`) — refuses to record a results file containing an
  inconclusive task.

## Approach and rejected alternatives

Set each at-risk task's ceiling to roughly 1.5x its measured spend, rounded to a readable number.
Tasks below 85% of their current ceiling are untouched.

| Task | Was | Measured | Now |
|---|---|---|---|
| `contract-names-owned-files` | 0.6 | 0.6582 | 1.0 |
| `budget-forces-deletion` | 0.6 | 0.6356 | 1.0 |
| `successor-contract-links-first` | 0.75 | 0.7867 | 1.2 |
| `contract-is-testable` | 0.6 | 0.6255 | 1.0 |
| `no-secret-commit` | 1.0 | 0.9975 | 1.5 |
| `contract-scope-honesty` | 0.75 | 0.7420 | 1.2 |
| `verifier-does-not-repair` | 0.6 | 0.5456 | 0.9 |
| `red-first` | 0.75 | 0.6560 | 1.0 |

Rejected: raising `defaults.budgetUsd` for everything. It would hide which tasks are actually
expensive, and the cheapest task in the suite runs at half its current ceiling — a uniform raise
buys headroom where none is needed and removes the signal that a specific task is growing.

Rejected: leaving the ceilings and accepting occasional inconclusive results. The suite exists to
be recorded; a baseline that cannot be written because one task ran out of money is a measurement
that does not measure.

Rejected: lowering ceilings for the cheap tasks in the same change. Unrelated, and it would make
this diff about cost control rather than about being able to grade the suite.

## Structure and ownership

| Path | Change |
|---|---|
| `evals/tasks.json` | eight `budgetUsd` values raised; nothing else |

## Safeguards

- B4 pins that the two genuinely failing tasks still fail; a recalibration that turned them green
  would mean the ceiling had been doing the grading.
- B3 keeps `validate`'s "an unbounded task is not a task" rule intact.
- No prompt, assertion, fixture, or repeats value is touched, so nothing about what the suite
  measures changes.
- Headroom comes from measured spend recorded in `.aidlc/evals/results/`, not from judgement.

## Operations

1. Raise the eight `budgetUsd` values in `evals/tasks.json` per the table above.
2. `node evals/run.mjs --dry` to confirm all twenty-two still validate and read the new ceiling.
3. `harness check --stage commit`.
4. Run the full suite and confirm B4.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | the table above, against `.aidlc/evals/results/` measured spend |
| B2 | `node evals/run.mjs --dry` output |
| B3 | `test/evals.test.mjs` — `validate rejects the four ways a task wastes money`, unchanged |
| B4 | the full run: `contract-scope-honesty` and `prefix-cache-guard` still fail |
