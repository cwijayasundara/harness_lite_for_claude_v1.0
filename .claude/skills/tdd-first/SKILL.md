---
name: tdd-first
description: Enforces red-green-refactor in vertical slices when writing new behaviour, instead of writing all tests first or all code first. This skill should be used whenever new behaviour is being added and a test does not yet exist for it.
---

# Write the test first, one slice at a time

```
WRONG                              RIGHT
test A, test B, test C             test A -> code A -> refactor
code A,  code B,  code C           test B -> code B -> refactor
                                   test C -> code C -> refactor
```

Horizontal slicing produces crap tests. Written in bulk, they test *imagined* behaviour: they
pass on the first run against code that does not exist yet only because they assert nothing
interesting, and by the time the implementation lands nobody re-reads them.

The red step is the part with the value. A test you never watched fail is a test you have not
verified. Watch it fail, and check it failed **for the reason you expected** — a test failing
on an import error is not a red step.

Refactor only with the bar green, and only without changing behaviour.
