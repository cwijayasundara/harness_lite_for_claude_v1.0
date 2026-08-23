---
name: pure-refactor
description: Keeps refactors behaviour-preserving and separate from behaviour changes, so that a diff is either a rename or a decision but never both. This skill should be used whenever restructuring, renaming, extracting, or moving existing code, and whenever a change is described as "cleanup" or "tidying".
---

# A refactor changes no behaviour

If the tests had to change, it was not a refactor. That is the whole rule, and it is a
mechanical test you can apply to your own diff before anyone else sees it.

- Green before, green after, **with the same tests**.
- No new behaviour. No fixed bugs. No "while I was in there".
- If you find a bug mid-refactor: write it down, finish the refactor, fix it in a second commit
  with its own test.

Mixed diffs are the single most expensive thing an agent can hand a reviewer. A hundred lines
of pure rename read in seconds; ten lines of behaviour change hidden inside a hundred lines of
rename cannot be reviewed at all, so they get approved unread.

Commit message convention: start it with `refactor:` and the reviewer knows the tests did not
change. If you cannot honestly write that prefix, split the commit.
