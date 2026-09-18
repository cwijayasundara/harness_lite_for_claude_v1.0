---
status: draft
migrated_from: sha256:76e0cf70ea0281884672c5310ca07c888f3bef1b0c838d48ffb5ac221e7d310a
---
# Plan: indicators-on-the-contract-chain

## Approach

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

## Files

| Path | Change |
|---|---|
| `.aidlc/lib/contract-chain.mjs` | new — per-change rows from intent ref, contract seals, and review |
| `.aidlc/lib/indicators.mjs` | `playbookIndicators` consumes contract-chain rows |
| `.aidlc/bin/harness` | `status` sources the playbook block from the contract chain |
| `docs/PLAYBOOK-CONFORMANCE.md` | new — stage-by-stage mapping with honest gaps |
| `test/indicators.test.mjs` | new — B1 to B6 |
| `test/lifecycle-cli.test.mjs` | its playbook assertions drive intent survival from legacy intent files, the source this change replaces |

## Order

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
