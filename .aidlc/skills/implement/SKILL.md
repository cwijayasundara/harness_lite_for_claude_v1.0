---
name: implement
description: Executes an approved delivery contract one behaviour at a time under a red-green loop. Use whenever code is about to be written for .aidlc/artifacts/contracts/<slug>.md or someone asks to build an accepted change.
---

# Implement the delivery contract

## The loop

For each behaviour in the contract's Operations and Proof sections:

1. **Red.** Write the test named in `## Proof`. Run it. Watch it fail for the right reason.
   A test that passes before the change proves nothing.
2. **Green.** Write the smallest code that makes it pass.
3. **Check.** `bash .aidlc/bin/harness check --stage fast --changed`. Fix what it says.
4. **Refactor.** Only with the test green, and only behaviour-preserving changes.

Vertical slices, one behaviour at a time. Never all tests first, then all implementation —
tests written in bulk test imagined behaviour rather than actual behaviour, and they pass for
the wrong reasons.

## Before you say "done"

```
bash .aidlc/bin/harness check --stage stop
```

Paste the output. If it is not green, you are not done. Do not report completion on a promise.

## The two rules that are not negotiable

- **Never edit a test to make it pass.** If a test is genuinely wrong, stop and say so — that
  is a spec question, not an implementation one. During a bug fix run
  `bash .aidlc/bin/harness lock tests --pattern <test path>` so the hook blocks test edits.
- **Never touch a file outside `## Structure and ownership`.** If you need another path, stop,
  amend the contract, and have the affected approvals sealed and committed again.

## When the contract turns out to be wrong

Say so, immediately, and stop. Amend and re-approve the contract, then continue. A silently
abandoned contract is the failure mode that makes agent output unreviewable. Record evidence for
every `B<n>` before reporting completion.
