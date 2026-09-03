---
status: draft
migrated_from: sha256:472a38f528c96cedea45500b24c30e0d7a7fc6e856782253f7f4d884bf22ecab
---
# Spec: indicators-on-the-contract-chain

## Outcome

`harness status` prints a real number for every playbook indicator, computed from the artifacts
the repository actually produces, and exits 0 for a change taken correctly through the contract
chain.

## Observable behaviours

### B1

Given a change with a committed accepted intent ref, a sealed contract, and a committed review,
When `harness status` runs,
Then `intent survival`, `time to committed intent`, `spec rework after plan` and `first-pass
review` each report a value rather than `unmeasured`, and the command exits 0.

### B2

Given an intent ref whose `decision.status` is `accepted` but whose acceptance is not committed,
When the indicators are computed,
Then it does not count as an accepted intent. An uncommitted decision is not an auditable gate —
the rule `lifecycle.mjs` already enforces, carried over rather than lost.

### B3

Given a contract whose spec approval digest changed in a commit later than its plan seal,
When `spec rework after plan` is computed,
Then that change is counted as rework.

### B4

Given a contract whose spec section never changed after the plan was sealed,
When `spec rework after plan` is computed,
Then it counts zero rework for that change.

### B5

Given a review artifact recorded `approved` that never held `changes-requested` in its history,
When `first-pass review` is computed,
Then it counts as a first-pass approval; one that did hold `changes-requested` does not.

### B6

Given a repository with no contracts at all,
When `harness status` runs,
Then every indicator reports `unmeasured` and the command exits 0. Absence of work is not a
failure, and it is not a zero either.

## Out of scope

Deleting `lifecycle.mjs`, the `spec/` and `plan/` layout keys, `declaredFiles`, or the
legacy-plan branch in `scope-drift` — all of that is the follow-on contract, once this one has
moved the measurement off them. `lifecycle.mjs` is not edited here. The `harness init`
prefix-cache defect. Re-enabling any CI workflow.

## Safeguards

- B2 carries over `lifecycle.mjs`'s rule that an uncommitted approval is not a gate. Losing it
  during the move would turn a governance control into a formatting change.
- B6 keeps `unmeasured` distinct from zero. A harness that reports 0% rework because it found no
  work is worse than one that says it does not know.
- No indicator is dropped: all six named in the intent are computed after this change.
- `lifecycle.mjs` is not edited, so `harness status`'s lifecycle block and its two unit tests
  continue to pass unchanged, and the follow-on deletion stays a separable diff.

## Entities and existing context

- `playbookIndicators(cfg, rows)` (`.aidlc/lib/indicators.mjs:56`) — reads `r.artifacts.intent`,
  `.spec`, `.plan`, `.review` off `lifecycle()` rows, plus `git log -S` for review history.
- `lifecycle()` (`.aidlc/lib/lifecycle.mjs:81`) — the row source being replaced. Its
  `firstCommit` / `approvalCommit` helpers encode B2 and are the part worth keeping.
- `validateContract` / `parseContract` (`.aidlc/lib/contract.mjs:122,91`) — already expose
  `spec_status`, `plan_status`, and both approval digests.
- `intent-refs/<slug>.json` — `decision.status` is `draft` / `accepted` / `closed`, which is the
  contract-model equivalent of the legacy intent `Status:` line.
- `renderPlaybook` (`.aidlc/lib/indicators.mjs:83`) — the output shape, unchanged by this work.
