# Delivery contract: scrub-personal-email

- **Schema:** aidlc.contract/v1
- **Change id:** scrub-personal-email
- **Intent ref:** ../intent-refs/scrub-personal-email.json
- **Story ref:** none
- **Risk:** low
- **Spec status:** draft
- **Spec approval digest:** pending
- **Plan status:** draft
- **Plan approval digest:** pending

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

## Entities and existing context

- `.aidlc/artifacts/` is ignored by `scope-drift` (`checks/scope-drift.mjs:68`) and carved out
  of `bashContractBlocked`, so nine of the twelve files needed no contract.
- `.aidlc/archive/legacy-lifecycle/intent/` is not carved out. scope-drift refused those three
  edits, which is why this contract exists.
- `cwijayasundara` already appears as the author of five archived intents — the existing
  convention, not a new identity.
- `validateIntentRef` (`lib/contract.mjs:100`) requires `decided_by` to be present but does not
  constrain its form.

## Approach and rejected alternatives

Literal string substitution across every tracked file, then revalidate all four contracts.

Rejected: redacting to a placeholder such as `redacted` or `owner`. The artifact chain records
who approved a gate; replacing that with an anonymous token weakens the audit trail to solve a
problem that a stable non-mailbox handle already solves.

Rejected: rewriting git history in the same change. Removing an address from a file is reversible
and reviewable; rewriting published commits is neither, and mixing them puts an irreversible
operation inside a routine diff.

## Structure and ownership

| Path | Change |
|---|---|
| `.aidlc/archive/legacy-lifecycle/intent/budget-blind-in-installed-layout.md` | Author line |
| `.aidlc/archive/legacy-lifecycle/intent/checklist-names-no-sample.md` | Author line |
| `.aidlc/archive/legacy-lifecycle/intent/ci-runs-without-a-key.md` | Author line |

## Safeguards

- No approval digest changes: B2 checks all four contracts after the substitution.
- Only the identity field is touched; no decision, date, or rationale is edited.
- The substitution is literal, so no adjacent text can be caught by a loose pattern.

## Operations

1. Replace the address with `cwijayasundara` in every tracked file that contains it.
2. Revalidate all four contracts.
3. `harness check --stage commit`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `git grep cwijay@biz2bricks` returns nothing |
| B2 | `harness contract validate` PASSes for all four contracts |
| B3 | `git diff` on the three archived intents shows only the Author line |
