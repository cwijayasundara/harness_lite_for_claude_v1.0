---
name: plan
description: Turns an approved spec into the files that will change, the order of the work, and the test that proves each behaviour. This skill should be used after a spec is approved and before implementation, and whenever someone asks how a change will be built or which files it will touch.
---

# Write the plan

`plan.md` is the second human gate, and the only place ownership is declared. Four sections.

## Approach

The chosen approach in a paragraph, and at least one real alternative you rejected with the
reason. A plan with no rejected alternative was not a decision, and the reviewer cannot tell
whether you considered the thing they are worried about.

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

Every `B<n>` in the spec appears exactly once. A behaviour with no proof is a behaviour nobody
will notice breaking, and "manual check" is only honest when the thing genuinely cannot be
automated — write what you will actually do.

## Before you ask for approval

```
.aidlc/bin/harness approve <slug> plan --by <them>
```

Theirs to run, after the spec is approved and committed. Editing the plan after approval reports
`stale-approval` and stops it governing anything, which is deliberate: a plan that could widen
its own scope after signing is not a gate.
