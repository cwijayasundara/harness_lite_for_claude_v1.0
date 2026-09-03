---
status: draft
migrated_from: aidlc.contract/v1
---
# Intent: scrub-personal-email

- **Status:** approved
- **Author:** cwijayasundara

## Problem

A personal email address appears as the author or approver identity in twelve committed
artifacts — nine under `.aidlc/artifacts/` and three archived intents. The repository is intended
to be shared, and an identity that is a working mailbox is more than the artifact chain needs:
the chain requires a stable approver identity, not a contact address.

## Outcome

No mailbox address appears in any tracked file. The approver identity stays stable and the
contract chain still validates.

## Affected systems

`.aidlc/artifacts/intent/*.md` and `intent-refs/*.json` (carved out of scope enforcement), and
`.aidlc/archive/legacy-lifecycle/intent/` — three archived intents that scope-drift correctly
refused to let this change touch without an owning contract.

## Constraints

The replacement identity must be the one already dominant in this repository —
`cwijayasundara`, used in five archived intents — so the artifacts do not gain a third spelling
of the same person. No approval digest may be invalidated: `decided_by` is not covered by any
contract seal, so replacing it must leave every contract validating.

Editing an archived artifact rewrites a historical record. Acceptable here because the change is
to an identity field only and the subject is the repository owner requesting it; nothing about
what was decided, when, or why is altered.

## Open questions

Commit author metadata on `main` carries the same address. Rewriting that is a separate,
history-rewriting decision and is not taken here.
