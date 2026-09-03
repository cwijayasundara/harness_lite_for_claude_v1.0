---
status: draft
migrated_from: sha256:e07f33744be7d6f69fc2048cfa2e981cb8a01ca87f9c42c39104dc6406bf54f1
---
# Spec: scrub-personal-email

## Outcome

No mailbox address appears in any tracked file, and every contract still validates.

## Observable behaviours

### B1

Given the repository at this commit,
When `git grep` searches tracked files for the address,
Then there are no matches.

### B2

Given the identity replacement,
When each contract is validated,
Then all four contracts still PASS. `decided_by` is outside every approval digest, so the
substitution must not disturb a seal.

### B3

Given the archived intents,
When they are compared before and after,
Then only the `Author:` line differs. What was decided, when, and why is untouched.

## Out of scope

Commit author metadata in git history — a history rewrite, and a separate decision. The
`cwijayasundara@gmail.com` address in this branch's commit metadata. Any change to what an
artifact says.

## Safeguards

- No approval digest changes: B2 checks all four contracts after the substitution.
- Only the identity field is touched; no decision, date, or rationale is edited.
- The substitution is literal, so no adjacent text can be caught by a loose pattern.

## Entities and existing context

- `.aidlc/artifacts/` is ignored by `scope-drift` (`checks/scope-drift.mjs:68`) and carved out
  of `bashContractBlocked`, so nine of the twelve files needed no contract.
- `.aidlc/archive/legacy-lifecycle/intent/` is not carved out. scope-drift refused those three
  edits, which is why this contract exists.
- `cwijayasundara` already appears as the author of five archived intents — the existing
  convention, not a new identity.
- `validateIntentRef` (`lib/contract.mjs:100`) requires `decided_by` to be present but does not
  constrain its form.
