---
status: draft
migrated_from: sha256:2bad8492ab3fe2cc91bf84e72a4f39232e71690b6c3062cfe668bd533c6c4b62
---
# Spec: recalibrate-eval-budgets

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

## Safeguards

- B4 pins that the two genuinely failing tasks still fail; a recalibration that turned them green
  would mean the ceiling had been doing the grading.
- B3 keeps `validate`'s "an unbounded task is not a task" rule intact.
- No prompt, assertion, fixture, or repeats value is touched, so nothing about what the suite
  measures changes.
- Headroom comes from measured spend recorded in `.aidlc/evals/results/`, not from judgement.

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
