# Delivery contract: indicators-on-the-contract-chain

- **Schema:** aidlc.contract/v1
- **Change id:** indicators-on-the-contract-chain
- **Intent ref:** ../intent-refs/indicators-on-the-contract-chain.json
- **Story ref:** none
- **Risk:** standard
- **Spec status:** approved
- **Spec approval digest:** sha256:92fbd59c582184c04f443bc5c33e07308e2100b400bea7c19df4e70ecfae8bb8
- **Plan status:** draft
- **Plan approval digest:** pending

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

## Approach and rejected alternatives

Add a contract-chain row source that returns, per change id, the intent ref with its decision and
commit times, the contract with both seal digests and the commits that introduced them, and the
review artifact. Point `playbookIndicators` at it. `renderPlaybook` is untouched, so the status
board keeps its shape while its inputs change.

`spec rework after plan` becomes "the spec approval digest changed in a commit after the plan
seal commit". The legacy proxy counted commits touching `spec.md` after `plan.md` was approved,
which counted typo fixes as rework and missed a spec edited in the same commit as something else.
Digest comparison answers the question the indicator was always asking.

Rejected: teaching `lifecycle()` about contracts. That keeps two models alive in one function and
is how the four defects above happened. The point is to end the split, not formalise it.

Rejected: deleting the legacy surfaces in this change. Re-basing the measurement and removing the
thing it measured, in one diff, is unreviewable — the standard this repository set for itself in
the `ci-runs-without-a-key` spec.

Rejected: dropping `design hours` and `intent rework after spec` rather than porting them. An
indicator that stops being computed is a governance requirement quietly abandoned, and the
playbook names both.

## Structure and ownership

| Path | Change |
|---|---|
| `.aidlc/lib/contract-chain.mjs` | new — per-change rows from intent ref, contract seals, and review |
| `.aidlc/lib/indicators.mjs` | `playbookIndicators` consumes contract-chain rows |
| `.aidlc/bin/harness` | `status` sources the playbook block from the contract chain |
| `docs/PLAYBOOK-CONFORMANCE.md` | new — stage-by-stage mapping with honest gaps |
| `test/indicators.test.mjs` | new — B1 to B6 |

## Safeguards

- B2 carries over `lifecycle.mjs`'s rule that an uncommitted approval is not a gate. Losing it
  during the move would turn a governance control into a formatting change.
- B6 keeps `unmeasured` distinct from zero. A harness that reports 0% rework because it found no
  work is worse than one that says it does not know.
- No indicator is dropped: all six named in the intent are computed after this change.
- `lifecycle.mjs` is not edited, so `harness status`'s lifecycle block and its two unit tests
  continue to pass unchanged, and the follow-on deletion stays a separable diff.

## Operations

1. Add `.aidlc/lib/contract-chain.mjs`: `rows(cfg)` returning `{ id, intent, contract, review }`
   per change, with commit times from git and both seal digests from `parseContract`.
2. Port `firstCommit` / `approvalCommit` semantics into it so B2 holds.
3. Point `playbookIndicators` at those rows; keep `renderPlaybook` unchanged.
4. Source the `status` playbook block from the new rows in `.aidlc/bin/harness`.
5. Write `docs/PLAYBOOK-CONFORMANCE.md`: the six stages, the artifact and gate for each, and the
   three known deviations — evals not in CI, agentic PR review off, Maintain unmeasured.
6. Add `test/indicators.test.mjs` for B1 to B6.
7. `harness check --stage commit`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/indicators.test.mjs`; `harness status` output on this branch, which has four completed chains |
| B2 | `test/indicators.test.mjs` — an uncommitted acceptance does not count |
| B3 | `test/indicators.test.mjs` — a spec digest changed after the plan seal counts as rework |
| B4 | `test/indicators.test.mjs` — an untouched spec counts zero |
| B5 | `test/indicators.test.mjs` — `changes-requested` in history disqualifies a first pass |
| B6 | `test/indicators.test.mjs` — an empty repository reports `unmeasured`, exit 0 |
