---
status: closed
migrated_from: aidlc.contract/v1
---
# Intent: cost-is-ratcheted-too

- **Status:** approved
- **Author:** cwijayasundara

## Problem

Eval tasks are getting more expensive run over run, and nothing notices.

```
contract-is-testable      0.625 -> 1.002 -> 1.256                          2.0x
budget-forces-deletion    0.184 -> 0.580 -> 0.636 -> 1.004 -> 0.991        5.4x
contract-scope-honesty    0.632 -> 0.742 -> 0.847 -> 1.208 -> ... -> 0.974 ~1.5x, noisy
```

Three ceilings were raised in a single session to keep the suite gradeable —
`contract-is-testable` 0.6 to 2.0, `budget-forces-deletion` 0.6 to 2.0,
`contract-scope-honesty` 0.75 to 2.5 — and each raise was reasonable in isolation. Nobody was
looking at the sequence, because nothing reports it.

`budgetUsd` is a per-run *cap*: it stops one task spending unboundedly, and firing means the task
could not finish. It is not a measure of drift. A task can double in cost and never touch its cap.

The mechanism to catch this is half-built. `under_baseline` is written, wired and tested, and
reads per-task metrics from `evals/baseline.json` — a file that does not exist, so it grades
nothing. Meanwhile `evals/expected.json` records a verdict per task and already has the ratchet
discipline: a raise-only `--update`, refusal on inconclusive, provenance in `sources`.

The likely cause is that every task reads a larger harness before doing any work — more skills, a
longer artifact chain, a bigger projection. That is a separate investigation. This intent is about
being able to see it.

## Outcome

A task that gets materially more expensive fails the gate, and a floor can only be lowered by
running cheaper.

## Affected systems

`.aidlc/lib/eval-gate.mjs`, `evals/expected.json`, and the gate's tests.

## Constraints

The floor records the **minimum** observed cost, never the latest. Recording the latest makes the
ratchet accommodate growth forever: every step of `budget-forces-deletion`'s five-fold climb would
have looked fine against the step before it. Growth has to be a deliberate act, like every other
threshold here.

Tolerance must absorb real noise. `contract-scope-honesty` swings between 0.858 and 1.208 for
identical work, so a tight bound would cry wolf and be ignored — which is worse than no bound.

Cost is not a verdict. A task that behaves correctly and costs too much has one problem, not two,
and the gate must say which.

## Open questions

Whether the tolerance belongs in `harness.toml` rather than the code. A project with noisier
models might need a different one, but a threshold that is easy to raise is a threshold that gets
raised — which is the failure this exists to catch. Left in code deliberately, for now.
