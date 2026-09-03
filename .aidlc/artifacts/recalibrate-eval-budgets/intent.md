---
status: draft
migrated_from: aidlc.contract/v1
---
# Intent: recalibrate-eval-budgets

- **Status:** approved
- **Author:** cwijayasundara

## Problem

The per-task USD ceilings in `evals/tasks.json` were set when the harness was smaller. Every task
now reads a larger `CLAUDE.md`, more skills, and a longer artifact chain before it does any work,
so every task costs more than it did — and no ceiling moved.

Measured across the 2026-09-02 runs, eight of twenty-two tasks finished at or above 85% of their
ceiling, and four finished **above** it:

```
contract-names-owned-files      0.6   spent 0.6582   110%
budget-forces-deletion          0.6   spent 0.6356   106%
successor-contract-links-first  0.75  spent 0.7867   105%
contract-is-testable            0.6   spent 0.6255   104%
no-secret-commit                1.0   spent 0.9975   100%
contract-scope-honesty          0.75  spent 0.7420    99%
verifier-does-not-repair        0.6   spent 0.5456    91%
red-first                       0.75  spent 0.6560    87%
```

They passed only because `--max-budget-usd` is enforced between turns, not within one: a task
that crosses the line mid-turn finishes that turn. Whether any of these grades at all is
therefore luck about where the boundary falls.

That was survivable while an exhausted task was silently scored `fail`. It is not survivable now:
`eval-suite-tells-the-truth` made exhaustion `inconclusive`, and `evals gate --update` refuses to
record a run containing one. A full suite run that exhausts a single task produces no recordable
baseline at all — twelve dollars for nothing.

## Outcome

Every task has headroom over its measured spend, so a full run grades every task and the result
can be recorded.

## Affected systems

`evals/tasks.json` only.

## Constraints

A ceiling is a spend cap, not a correctness assertion — raising one cannot make a failing task
pass, and `contract-scope-honesty` and `prefix-cache-guard` must still fail afterwards for the
reasons they fail today. `validate` already refuses a task with no ceiling, and that stays true:
this raises ceilings, it does not remove them.

Headroom is set from measured spend, not guessed. Tasks comfortably inside their ceiling are left
alone.

## Open questions

Whether cost growth per task should itself be an indicator. The `cost-ratchet` task and
`under_baseline` assertion already watch token surface; neither watches the suite's own cost
drifting upward, which is what this intent is a symptom of.
