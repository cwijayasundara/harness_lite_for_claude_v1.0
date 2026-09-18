---
status: draft
migrated_from: sha256:55de5b8f641bfec8555e79028adb764688beff778088b640d959862fa0480450
---
# Spec: scope-drift-reads-every-contract

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

## Safeguards

- B2 keeps the check's purpose: an unowned file is still a finding.
- B3 keeps `contract-invalid`, so a half-approved contract in flight still fails and
  `contract-scope-honesty` still fails for the reason it is written.
- B4 keeps "uncommitted approval is not a gate".
- B6 pins guard and check to the same answer, which is the defect this contract exists to close.
- `contractScopeState` is not modified, so the write guard's behaviour is unchanged.

## Entities and existing context

- `contractScopeState` (`.aidlc/lib/guard.mjs:19`) — validates each contract, requires
  `plan_status === 'approved'` and `isCommitted`, and unions `ownedFiles`. This is the behaviour
  being adopted, not re-derived.
- `currentDeliveryArtifact` (`.aidlc/checks/scope-drift.mjs:29`) — ranks by dirtiness then mtime.
  It stays, but only to answer "which contract is being written now" for B3, not "what is owned".
- `run` (`.aidlc/checks/scope-drift.mjs:51`) — the single-contract read being replaced.
- `contract-scope-honesty` — the eval that proves B3 end to end; it currently fails on
  `contract-invalid` from a draft contract the model created for an out-of-scope edit.
