---
status: draft
migrated_from: sha256:66615dc85253debee41b3e17b87e8291a49f2e5ea1774c0c97c666dd8703a12d
---
# Plan: retire-the-legacy-lifecycle

## Approach

Move before deleting, in one diff but in that order. `incidents()` and its rendering move to
`.aidlc/lib/incidents.mjs`. The SLA clocks re-base onto `contract-chain.rows()`, which already
holds every timestamp but the review approval. `harness status` then renders contracts and
incidents, and `lifecycle.mjs` has no callers left to lose.

Rejected: deleting `lifecycle.mjs` and letting the SLA clocks go with it. The playbook asks for
time-based indicators at every stage; removing the host of a governance feature is not the same
as deciding you no longer need it, and B2 exists so the difference is testable.

Rejected: keeping `lifecycle.mjs` for repositories still on the pre-contract model. It has
produced five defects by coexisting. A project that needs the old model can pin the harness
commit that still has it — which is what declaring the harness by version is for.

Rejected: deleting `contract migrate` along with the model. Every defect this retirement fixes
came from a *gate or an indicator* reading the legacy chain — two things disagreeing about a
verdict. Migration is read-only, on demand, and participates in no gate, so it cannot produce that
class of defect; and it is the documented off-ramp for the pre-v1 repositories this change most
affects. Removing it for tidiness would strand exactly the people it is for.

Rejected: splitting this into "move" then "delete" contracts. The move leaves `lifecycle.mjs`
importable with no callers, which is the same two-models-alive state in a new shape. The ordering
inside the diff is what keeps it reviewable, not a second contract.

## Files

| Path | Change |
|---|---|
| `.aidlc/lib/incidents.mjs` | new — `incidents()` and its rendering, moved intact |
| `.aidlc/lib/contract-chain.mjs` | rows carry the review approval date and an SLA verdict per change |
| `.aidlc/lib/lifecycle.mjs` | deleted |
| `.aidlc/bin/harness` | `status` renders contracts and incidents; no legacy block |
| `.aidlc/lib/paths.mjs` | `spec` and `plan` layout keys removed |
| `.aidlc/lib/guard.mjs` | `declaredFiles` removed |
| `.aidlc/checks/scope-drift.mjs` | legacy-plan branch removed |
| `test/unit.test.mjs` | the two `lifecycle()` tests move to the contract chain |
| `test/lifecycle-cli.test.mjs` | the uncommitted-acceptance test moves to the contract chain |
| `test/indicators.test.mjs` | B2 coverage for the SLA verdict |
| `test/contract.test.mjs` | B7 — approval ordering, whose only coverage was the legacy test |
| `test/guard.test.mjs` | its tmp layout builds a legacy plan directory |

## Order

1. Add `.aidlc/lib/incidents.mjs` with `incidents()` and its rendering, moved verbatim.
2. Add the review approval date and a per-change SLA verdict to `contract-chain.rows()`.
3. Render contracts and incidents in `harness status`; drop the legacy block and its exit-code
   contribution, keeping the contract and incident contributions.
4. Delete `.aidlc/lib/lifecycle.mjs`.
5. Remove `layout.spec`, `layout.plan`, `declaredFiles`, and the legacy-plan branch.
6. Move the affected tests onto the contract chain.
7. `harness check --stage commit`, and confirm `harness status` exits 0.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `harness status` on this repository: no legacy block, and the only non-zero cause is a real SLA breach |
| B2 | `test/indicators.test.mjs` — a completed chain reports an SLA verdict |
| B3 | `test/lifecycle-cli.test.mjs` — the incident SLA test, unchanged |
| B4 | `test/lifecycle-cli.test.mjs` — an incident with no intent is INVALID and exits non-zero |
| B5 | `grep` finds no importer of `lifecycle.mjs`, no `declaredFiles`, and no gate reading the legacy dirs |
| B7 | `test/contract.test.mjs` — spec before acceptance, and plan before spec, are both invalid |
| B6 | `test/lifecycle-cli.test.mjs` — an invalid contract still exits non-zero |
