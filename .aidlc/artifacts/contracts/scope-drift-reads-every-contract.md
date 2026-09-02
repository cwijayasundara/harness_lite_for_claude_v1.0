# Delivery contract: scope-drift-reads-every-contract

- **Schema:** aidlc.contract/v1
- **Change id:** scope-drift-reads-every-contract
- **Intent ref:** ../intent-refs/scope-drift-reads-every-contract.json
- **Story ref:** none
- **Risk:** standard
- **Spec status:** approved
- **Spec approval digest:** sha256:55de5b8f641bfec8555e79028adb764688beff778088b640d959862fa0480450
- **Plan status:** approved
- **Plan approval digest:** sha256:aeb178b28288e52c20c4b6d3b9beddad6790d35c926e08ff96bd0dd7529d30b7

## Outcome

The write guard and the commit check give the same answer about the same path.

## Observable behaviours

### B1

Given two approved committed contracts, A owning `src/a.py` and B owning `src/b.py`,
When only `src/a.py` has changed and B is the most recently modified contract,
Then `scope-drift` passes.

### B2

Given the same two contracts,
When `src/unowned.py` has changed,
Then `scope-drift` fails naming that file. Widening what counts as owned must not stop the check
catching a file no contract owns.

### B3

Given an in-flight contract that is invalid or whose plan is not approved,
When `scope-drift` runs,
Then it fails with `contract-invalid`, as it does today. This is the signal
`contract-scope-honesty` depends on.

### B4

Given a contract that is approved but **not committed**,
When `scope-drift` runs,
Then its owned paths do not count. An uncommitted approval is not an auditable gate — the rule
`contractScopeState` already applies, carried over rather than loosened.

### B5

Given a repository with no contracts at all,
When `scope-drift` runs,
Then it is `skipped`, as today.

### B6

Given the same inputs,
When `writeBlocked` and `scope-drift` are each asked about a path,
Then they agree on whether it is owned.

## Out of scope

The legacy-plan fallback and `declaredFiles` — the legacy-lifecycle deletion owns those. Making a
contract record which commits belong to it, noted as the open question in the intent. Any change
to `contractScopeState` itself, which is already correct.

## Entities and existing context

- `contractScopeState` (`.aidlc/lib/guard.mjs:19`) — validates each contract, requires
  `plan_status === 'approved'` and `isCommitted`, and unions `ownedFiles`. This is the behaviour
  being adopted, not re-derived.
- `currentDeliveryArtifact` (`.aidlc/checks/scope-drift.mjs:29`) — ranks by dirtiness then mtime.
  It stays, but only to answer "which contract is being written now" for B3, not "what is owned".
- `run` (`.aidlc/checks/scope-drift.mjs:51`) — the single-contract read being replaced.
- `contract-scope-honesty` — the eval that proves B3 end to end; it currently fails on
  `contract-invalid` from a draft contract the model created for an out-of-scope edit.

## Approach and rejected alternatives

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

## Structure and ownership

| Path | Change |
|---|---|
| `.aidlc/checks/scope-drift.mjs` | ownership is the union of all approved committed contracts; validity stays per in-flight contract |
| `test/scope-drift.test.mjs` | B1 to B6 |

## Safeguards

- B2 keeps the check's purpose: an unowned file is still a finding.
- B3 keeps `contract-invalid`, so a half-approved contract in flight still fails and
  `contract-scope-honesty` still fails for the reason it is written.
- B4 keeps "uncommitted approval is not a gate".
- B6 pins guard and check to the same answer, which is the defect this contract exists to close.
- `contractScopeState` is not modified, so the write guard's behaviour is unchanged.

## Operations

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
