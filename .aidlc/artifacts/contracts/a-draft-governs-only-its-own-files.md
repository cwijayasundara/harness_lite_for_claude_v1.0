# Delivery contract: a-draft-governs-only-its-own-files

- **Schema:** aidlc.contract/v1
- **Change id:** a-draft-governs-only-its-own-files
- **Intent ref:** ../intent-refs/a-draft-governs-only-its-own-files.json
- **Story ref:** none
- **Risk:** standard
- **Spec status:** approved
- **Spec approval digest:** sha256:14ef6523b0b042d753a4cd75cdb0be8f809bae8665634ba131ca46da9e382ed4
- **Plan status:** draft
- **Plan approval digest:** pending

## Outcome

Drafting the next piece of work does not make the current piece uncommittable.

## Observable behaviours

### B1

Given an approved committed contract owning the changed files, and a separate draft contract
owning nothing that changed,
When `scope-drift` runs,
Then it passes.

### B2

Given a draft contract that owns a file which has changed,
When `scope-drift` runs,
Then it fails `contract-invalid` naming that contract. Implementing against an unapproved
contract is the rule being kept.

### B3

Given an approved contract whose approval digest has gone stale, owning a changed file,
When `scope-drift` runs,
Then it fails `contract-invalid`. Staleness is not a lesser kind of unapproved.

### B4

Given changed files owned by no contract at all,
When `scope-drift` runs,
Then it fails `scope-drift` naming them, as it does today.

### B6

Given an approved committed contract owning `tests/test_app.py`, and a draft contract that also
claims it, and that file has changed,
When `scope-drift` runs,
Then it passes. The change is authorised by the approved owner; a second contract claiming the
same path does not un-authorise it. An unapproved contract is a finding only when it is the sole
claimed authority for something that changed.

### B5

Given `contract-scope-honesty`,
When it is re-run,
Then it passes: the model implements only its contract's paths, refuses the out-of-scope edit,
and may draft a contract for the deferred work without failing the commit stage.

## Out of scope

Removing `currentDeliveryArtifact` — recorded as the intent's open question. The
`delivery-scope-missing` finding, which stays keyed to the in-flight artifact.

## Entities and existing context

- `currentDeliveryArtifact` (`.aidlc/checks/scope-drift.mjs:29`) — "the dirty one, else the most
  recently modified". A draft being written is always the dirty one, which is why an unrelated
  draft became the contract the whole diff was validated against.
- `ownedByAnyContract` (`.aidlc/checks/scope-drift.mjs:53`) — added by
  `scope-drift-reads-every-contract`, which fixed the ownership half of exactly this defect and
  left the validity half.
- `validateContract` (`.aidlc/lib/contract.mjs:122`) — the approval and digest rules. Unchanged;
  only which contracts it is asked about changes.
- The 2026-09-02 `contract-scope-honesty` run, in which the model behaved correctly and the check
  failed anyway.

## Approach and rejected alternatives

Ask validity of the contracts that own something that changed, rather than of one contract chosen
by mtime. A contract that owns nothing in this diff is not governing this diff.

Rejected: ignoring draft contracts entirely. It would make B2 unreachable — implementing against
a draft would become invisible, which is the failure `contract-scope-honesty` exists to catch.

Rejected: keeping the heuristic and excluding contracts created in this diff. "Created in this
diff" is not the property that matters; owning a changed file is, and it is directly observable.

Rejected: requiring every contract in the tree to be approved before any commit. That is today's
behaviour stated plainly, and it means the artifact chain cannot be used the way it is designed —
draft, seal, implement — because the draft blocks the commit that would seal it.

## Structure and ownership

| Path | Change |
|---|---|
| `.aidlc/checks/scope-drift.mjs` | validity is asked of contracts that own a changed file |
| `test/scope-drift.test.mjs` | B1 to B4 |

## Safeguards

- B2 and B3 keep the control: implementing against a draft or a stale approval still fails, so the
  change narrows what is checked and not how strictly.
- B4 keeps the unowned-file finding, which is the check's original purpose.
- `validateContract` is untouched, so what counts as approved is unchanged.
- The `contract-scope-honesty` eval remains able to fail for the reason it was written, which is
  the difference between narrowing a check and blunting it.

## Operations

1. In `.aidlc/checks/scope-drift.mjs`, compute changed files before validity.
2. Report `contract-invalid` for any contract that fails validation *and* owns a changed file.
3. Keep the unowned-file `scope-drift` finding unchanged.
4. Add B1 to B4 to `test/scope-drift.test.mjs`.
5. `harness check --stage commit`, then re-run `contract-scope-honesty` for B5.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/scope-drift.test.mjs` — an unrelated draft does not fail the commit |
| B2 | `test/scope-drift.test.mjs` — a draft owning a changed file still fails |
| B3 | `test/scope-drift.test.mjs` — a stale approval owning a changed file still fails |
| B4 | `test/scope-drift.test.mjs` — an unowned changed file still fails |
| B6 | `test/scope-drift.test.mjs` — a draft sharing an approved contract's path does not fail |
| B5 | the `contract-scope-honesty` eval verdict after the change |
