---
status: closed
migrated_from: aidlc.contract/v1
---
# Intent: the-ledger-cannot-judge-a-deterrent

- **Status:** approved
- **Author:** cwijayasundara

## Problem

The ledger audit is the mechanism that authorises deleting a control. Asked for the first time
with enough evidence to answer, it named the wrong control.

```
budget          56 inv   0.0% fired   DELETE — never fired; remove it and run the eval suite
arch             1 inv   0.0% fired   wait — 50 invocations needed
test_quality     1 inv   0.0% fired   wait — 50 invocations needed

Delete candidates: budget
```

`budget` fires the instant a limit is crossed — lowering the skills limit by one produces
`budget/skills | skills = 10, limit 9` immediately. It has never fired because the repository has
sat at exactly 10/10 skills, 3/3 agents and 5/5 hook bindings for 56 invocations and nobody tried
to add an eleventh. It is a deterrent standing at its limit, and CLAUDE.md treats it as
load-bearing: "Adding one means deleting one."

`arch` and `test_quality` are named by no stage. `[stages]` runs `secrets`, `test`, `scope-drift`
and `budget`; those two appear only under `[sensors]`, reachable through the manually-run
gauntlet. They have one invocation each and will never accumulate fifty, so the audit will advise
"wait" forever.

So the criterion conflates three different things behind one number:

1. a control that fires when it should — earning its place;
2. a control that never fires because the condition never arose, but would — a deterrent;
3. a control that never fires because it never runs — invisible to a session-based measure.

Deleting (2) removes the reason the condition never arose. Waiting on (3) waits for evidence that
cannot arrive.

## Outcome

The audit distinguishes a control that did not fire from one that did not run, and stops asserting
a deletion it cannot justify.

## Affected systems

`.aidlc/lib/ledger.mjs` and its tests.

## Constraints

The audit must stay decisive. Its value is "a list of decisions a person can act on in minutes",
and replacing every verdict with "it depends" would be a worse failure than the one being fixed.
What changes is which decision is offered, not whether one is.

`KILL` thresholds are not touched: the numbers were never the problem.

## Open questions

Whether "never fired" can ever be judged automatically. A deterrent and a dead control are
indistinguishable in the ledger; the difference lives in the control's `why:`, which is prose. The
audit can surface the question against the right control, which is as far as it should go.
