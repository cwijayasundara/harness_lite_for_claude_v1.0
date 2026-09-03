# Intent: the-suite-total-is-ratcheted

- **Status:** approved
- **Author:** cwijayasundara

## Problem

`cost-is-ratcheted-too` catches a task that explodes. It cannot catch the suite creeping.

The per-task tolerance is `1.5x`, and it has to be: identical work has measured between 0.858 and
1.208, so a tighter bound fires on noise and gets ignored. But twenty-two tasks each growing 49%
is a suite that costs half as much again, with every individual task inside tolerance and nothing
saying a word. That is precisely the shape of the drift this was built to see — small steps, each
reasonable against the one before it.

Aggregate noise is much smaller than per-task noise, because independent variation cancels.
Comparing like for like — full runs at `--repeats 1` over the same task set:

```
2026-09-02T04-09-37   22 tasks   $12.31
2026-09-02T05-21-50   22 tasks   $13.40      9% apart
```

The older `$18.94` run is not comparable: it ran repeats of three on some tasks and had five
failures, and a failing task burns its whole budget.

So a suite-level floor can carry a much tighter bound than a per-task one, and the two together
close the gap: per-task catches one thing exploding, suite-level catches everything creeping.

## Outcome

A suite that gets materially more expensive fails the gate, even when no single task does.

## Affected systems

`.aidlc/lib/eval-gate.mjs`, `evals/expected.json`, `.aidlc/bin/harness`, and the gate's tests.

## Constraints

The total must compare like with like. A run grading a different set of tasks has an
incomparable total, and reporting one would be worse than reporting none.

The floor falls only, for the same reason the per-task floor does.

The tolerance is set from two comparable runs. That is thin evidence, and the number should be
revisited once there are more — it is recorded as a measured estimate, not a law.

## Open questions

Whether cost should be normalised per task rather than summed, so adding a twenty-third task does
not read as a regression. Adding a task legitimately raises the total, and today that would fail
the gate until someone re-records. A mean would survive it; a mean also hides one expensive task
among many cheap ones, which the per-task floor already covers. Not resolved here.
