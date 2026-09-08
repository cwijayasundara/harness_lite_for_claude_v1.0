---
name: plan
description: Turns an approved spec into the files that will change, the order of the work, and the test that proves each behaviour. This skill should be used after a spec is approved and before implementation, and whenever someone asks how a change will be built or which files it will touch.
---

# Write the plan

`plan.md` is the second human gate, and the only place ownership is declared.

## Approach

Describe the approach and why it fits the approved design, repository patterns and affected
system. Explain a meaningful alternative when a real tradeoff exists; do not invent one for
a routine change. Identify consequential unknowns before implementation.

## Files

Every path this change may touch, in backticks, one per line:

```
- `src/reminders/schedule.py`
- `tests/test_schedule.py`
```

This is not documentation. `scope-drift` and the write guard read this section and nothing else:
a path not named here cannot be written, and a changed file not named here fails the commit
stage. A directory (`src/reminders/`) claims everything under it — use one when the change is
genuinely a whole module, not to avoid thinking.

## Order

Numbered steps, each naming an exact path. Enough that someone else could run it. If the order
does not matter, say so and leave one step.

## Proof

One row per behaviour in the spec, naming the test that will prove it:

| Behaviour | Test or evidence |
|---|---|
| B1 | `tests/test_schedule.py::test_skips_recent_reminder` |

Use existing regression checks for preserved behaviour and name runtime proof for changed
paths, including relevant edge cases. Keep steps small enough to verify as you go.

Every `B<n>` in the spec appears exactly once. A behaviour with no proof is a behaviour nobody
will notice breaking, and "manual check" is only honest when the thing genuinely cannot be
automated — write what you will actually do.

## Before you ask for approval

```
.aidlc/bin/harness approve <slug> plan --by <them>
```

Theirs to run, after the spec is approved and committed. Editing the plan after approval reports
`stale-approval` and stops it governing anything, which is deliberate: a plan that could widen
its own scope after signing is not a gate. Routine choices inside the approved approach and
owned files do not require another approval; material design or scope changes do.

Use optional depends_on scalar slugs for delivery prerequisites. A Dependencies table
(Change | Interface | Revision) records shared interface paths and exact Git commits,
with targets drawn from depends_on. Run status to inspect cycles, missing prerequisites,
interface drift and local scope overlaps; choose a shared prerequisite, serialization or
integration owner. Change assignments in the existing tracker; record the tracker URL on
the intent. Inspect a revision with `git show <rev>:<path>` and `git grep`. Review schemas
and shared invariants even when paths do not overlap. Approval or closure cannot prove
integration readiness. Update from the target branch and run affected contract/regression
tests; material interface or scope changes need renewed review.
