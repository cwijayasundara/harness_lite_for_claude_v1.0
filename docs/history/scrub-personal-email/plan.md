---
status: draft
migrated_from: sha256:97ec73688b5b6bd446e33d609068d35bb36df84724e2fba28485beef60af7336
---
# Plan: scrub-personal-email

## Approach

Literal string substitution across every tracked file, then revalidate all four contracts.

Rejected: redacting to a placeholder such as `redacted` or `owner`. The artifact chain records
who approved a gate; replacing that with an anonymous token weakens the audit trail to solve a
problem that a stable non-mailbox handle already solves.

Rejected: rewriting git history in the same change. Removing an address from a file is reversible
and reviewable; rewriting published commits is neither, and mixing them puts an irreversible
operation inside a routine diff.

## Files

| Path | Change |
|---|---|
| `.aidlc/archive/legacy-lifecycle/intent/budget-blind-in-installed-layout.md` | Author line |
| `.aidlc/archive/legacy-lifecycle/intent/checklist-names-no-sample.md` | Author line |
| `.aidlc/archive/legacy-lifecycle/intent/ci-runs-without-a-key.md` | Author line |

## Order

1. Replace the address with `cwijayasundara` in every tracked file that contains it.
2. Revalidate all four contracts.
3. `harness check --stage commit`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `git grep` for the address returns no match in any tracked file — including this contract, which must not quote what it is removing |
| B2 | `harness contract validate` PASSes for all four contracts |
| B3 | `git diff` on the three archived intents shows only the Author line |
