---
status: draft
migrated_from: sha256:aeb178b28288e52c20c4b6d3b9beddad6790d35c926e08ff96bd0dd7529d30b7
---
# Plan: scope-drift-reads-every-contract

## Approach

Split the two questions the function currently conflates. Ownership becomes the union across all
valid, approved, committed contracts, obtained the same way the guard obtains it. Validity stays
a property of the contract being written now, so a half-approved in-flight contract still fails.

Rejected: exporting and calling `contractScopeState` directly. It is not exported and returns
only `{ declared, parseError }`, dropping which contract owned what — useful in a finding
message. The union is small and reusing `ownedFiles` and `validateContract` keeps one definition
of validity.

Rejected: making scope-drift consult only the dirty contract and skipping when none is dirty.
That silently stops checking on any commit where the contract was committed in an earlier commit
— which is every implementation commit in this repository's own workflow.

Rejected: requiring each change to name its governing contract. Stronger, and the right long-term
answer, but the artifact chain does not record which commits belong to a contract, so it cannot
be implemented without adding that. Noted in the intent.

## Files

| Path | Change |
|---|---|
| `.aidlc/checks/scope-drift.mjs` | ownership is the union of all approved committed contracts; validity stays per in-flight contract |
| `test/scope-drift.test.mjs` | B1 to B6 |

## Order

1. In `.aidlc/checks/scope-drift.mjs`, add an owned-paths union over all valid, approved,
   committed contracts.
2. Keep `currentDeliveryArtifact` for the in-flight validity check only, and keep its
   `contract-invalid` finding.
3. Compare changed files against the union.
4. Add B1 to B6 to `test/scope-drift.test.mjs`.
5. `harness check --stage commit`, and re-run `contract-scope-honesty` to confirm B3.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/scope-drift.test.mjs` — a file owned by a non-newest contract passes |
| B2 | `test/scope-drift.test.mjs` — an unowned file still fails |
| B3 | `test/scope-drift.test.mjs` — an invalid in-flight contract still fails |
| B4 | `test/scope-drift.test.mjs` — an uncommitted contract's paths do not count |
| B5 | `test/scope-drift.test.mjs` — no contracts is `skipped` |
| B6 | `test/scope-drift.test.mjs` — guard and check agree; and `evals/expected.json` passes `--stage commit` |
