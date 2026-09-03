---
name: change-safely
description: Decides how to change existing code safely — check the net, pin behaviour with characterisation tests, sprout beside code too tangled to test, and keep refactors free of behaviour changes. This skill should be used before modifying any existing code, whenever working in an unfamiliar or legacy area, and whenever a change is described as cleanup, tidying, restructuring, renaming, extracting, or moving code.
---

# Changing code that already exists

Four moves, one decision. Find the safety net, then pick.

```
.aidlc/bin/harness check --stage drift        # coverage, if the project has it
```

| What you find | What to do |
|---|---|
| Covered, with meaningful assertions | Change it. The suite will tell you if you broke it. |
| Covered by line, thin assertions | Strengthen the assertions first. High coverage with weak assertions is worse than none: it buys false confidence. |
| Not covered, and small enough to characterise | **Pin** it, below. Do not edit blind. |
| Not covered, and too tangled to characterise | **Sprout** beside it, below. |
| No behaviour change intended at all | **Refactor** purely, below. |

Coverage is a map of where you are safe, not a target. Do not write tests to raise a number;
write them where you are about to be dangerous. A project at 40% where the 40% is the payment
path is in better shape than one at 80% covering only the getters.

## Pin

Untested code has no specification — it has behaviour, some of it load-bearing and undocumented,
and you find out which in production.

1. Run the code and record what it actually does: bad input, empty input, the edge nobody hits.
2. Assert exactly that, including the parts that look like bugs. You are pinning reality, not
   endorsing it.
3. Commit those tests on their own, green against the unmodified code.
4. Now change it. A characterisation test going red is a behaviour change: intended, and you say
   so in the message, or a regression you just caught.

A pinned behaviour that is clearly wrong does not get fixed in the same commit. Note it, finish
the change, fix it separately with its own intent.

## Sprout

When new behaviour has to live inside a function you cannot safely test, do not edit inside it.

1. Write the new behaviour as a new, fully tested unit beside it.
2. Call it from the old code once. One line, one place.
3. Leave the rest of the old code untouched.

The diff is one tested unit plus a line, which is reviewable. Twenty edits threaded through four
hundred untested lines is not, and it is where agents do the most damage. That one-line seam is
also what lets the old code be pinned and dismantled later: a codebase gets tested by
accumulating footholds, not by a testing sprint nobody schedules.

## Refactor

If the tests had to change, it was not a refactor. That is the whole rule, and you can apply it
to your own diff before anyone else sees it.

- Green before, green after, with the same tests.
- No new behaviour, no fixed bugs, no "while I was in there".
- A bug found mid-refactor gets written down, not fixed here. Second commit, own test.

Mixed diffs are the most expensive thing you can hand a reviewer. A hundred lines of pure rename
read in seconds; ten lines of behaviour change hidden inside them cannot be reviewed at all, so
they get approved unread. Start the message with `refactor:` and the reviewer knows the tests did
not change. If you cannot honestly write that prefix, split the commit.
