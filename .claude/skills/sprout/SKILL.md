---
name: sprout
description: Adds new behaviour beside untested legacy code as a separately tested unit rather than editing inside it, when pinning the existing behaviour is impractical. This skill should be used when new logic must go into a large untested function or class, and when a change is blocked by code that is too tangled to test.
---

# Sprout instead of editing

When new behaviour has to live inside a function you cannot safely test, do not edit inside it.

1. Write the new behaviour as a **new, fully tested** function or class next to it.
2. Make **one** call to it from the old code. One line, at one point.
3. Leave everything else in the old code untouched.

The diff is then one new tested unit plus a single line. That is reviewable. The alternative —
twenty edits threaded through four hundred untested lines — is not, and it is where agents do
the most damage.

The one-line seam is also the thing that lets the old code be pinned and dismantled later.
Every sprout is a foothold; a codebase gets tested by accumulating them, not by a testing
sprint that never gets scheduled.

Use `pin-behaviour` instead when the surrounding code is small enough to characterise. Sprout
is for when it is not.
