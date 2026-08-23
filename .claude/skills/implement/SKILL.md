---
name: implement
description: Executes an approved plan.md under a red-green loop, consulting harness check after every edit and never weakening a test to make it pass. This skill should be used whenever code is about to be written against an existing plan, and whenever someone says "build it", "implement this", or "go ahead". Requires an approved .claude/artifacts/plan/<slug>.md.
---

# Implement the plan

## The loop

For each item in the plan's order of work:

1. **Red.** Write the test named in `## Proof`. Run it. Watch it fail for the right reason.
   A test that passes before the change proves nothing.
2. **Green.** Write the smallest code that makes it pass.
3. **Check.** `bash .claude/bin/harness check --stage fast --changed`. Fix what it says.
4. **Refactor.** Only with the test green, and only behaviour-preserving changes.

Vertical slices, one behaviour at a time. Never all tests first, then all implementation —
tests written in bulk test imagined behaviour rather than actual behaviour, and they pass for
the wrong reasons.

## Before you say "done"

```
bash .claude/bin/harness check --stage stop
```

Paste the output. If it is not green, you are not done. Do not report completion on a promise.

## The two rules that are not negotiable

- **Never edit a test to make it pass.** If a test is genuinely wrong, stop and say so — that
  is a spec question, not an implementation one. During a bug fix the harness will block test
  edits outright via `.claude/state/test-lock.json`.
- **Never touch a file outside the plan's `## Files` block.** If you need to, update the plan
  in the same commit and say why. `harness check --stage commit` will catch it either way.

## When the plan turns out to be wrong

Say so, immediately, and stop. Amend the plan, get it re-approved, then continue. A silently
abandoned plan is the failure mode that makes agent output unreviewable.
