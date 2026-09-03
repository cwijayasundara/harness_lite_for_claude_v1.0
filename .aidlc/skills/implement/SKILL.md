---
name: implement
description: Executes an approved plan one behaviour at a time under a red-green loop. Use whenever code is about to be written for .aidlc/artifacts/<slug>/plan.md or someone asks to build an approved change.
context: fork
model: claude-haiku-4-5-20251001
---

# Implement the approved plan

## The loop

For each behaviour in `spec.md`, in the order `plan.md` gives:

1. **Red.** Write the test named in `## Proof`. Run it. Watch it fail for the right reason.
   A test that passes before the change proves nothing.
2. **Green.** Write the smallest code that makes it pass.
3. **Check.** `bash .aidlc/bin/harness check --stage fast --changed`. Fix what it says.
4. **Refactor.** Only with the test green, and only behaviour-preserving changes.

Vertical slices, one behaviour at a time:

```
WRONG                              RIGHT
test A, test B, test C             test A -> code A -> refactor
code A,  code B,  code C           test B -> code B -> refactor
                                   test C -> code C -> refactor
```

Horizontal slicing produces crap tests. Written in bulk they assert imagined behaviour, they pass
on the first run only because they assert nothing interesting, and by the time the implementation
lands nobody re-reads them.

The red step carries the value. A test you never watched fail is a test you have not verified,
and a test failing on an import error is not a red step — check it failed for the reason you
expected.

## Before you say "done"

```
bash .aidlc/bin/harness check --stage stop
```

Paste the output. If it is not green, you are not done. Do not report completion on a promise.

## The two rules that are not negotiable

- **Never edit a test to make it pass.** If a test is genuinely wrong, stop and say so — that is
  a spec question, not an implementation one.
- **Never touch a file outside `## Files` in `plan.md`.** If you need another path, stop, add it
  to the plan, and have the plan approved and committed again.

## When the plan turns out to be wrong

Say so, immediately, and stop. Amend the spec or the plan, get it approved again, then continue.
A silently abandoned plan is the failure mode that makes agent output unreviewable.
