# Delivery contract: retire-the-legacy-lifecycle

- **Schema:** aidlc.contract/v1
- **Change id:** retire-the-legacy-lifecycle
- **Intent ref:** ../intent-refs/retire-the-legacy-lifecycle.json
- **Story ref:** none
- **Risk:** standard
- **Spec status:** approved
- **Spec approval digest:** sha256:797d3f333b6c180198d2abd615b5f394ed641da79ac955a714fe9b45a60c083f
- **Plan status:** draft
- **Plan approval digest:** pending

## Outcome

One artifact model, and `harness status` exits 0 for a repository whose contracts are healthy.

## Observable behaviours

### B1

Given this repository, whose eight changes all went through the contract chain,
When `harness status` runs,
Then it exits 0 and prints no `spec` or `plan` next-stage row.

### B2

Given a change whose intent was accepted, contract sealed, and review committed,
When `harness status` runs,
Then that change shows an SLA verdict — `within`, `breached`, or `unmeasured` — computed from
the contract chain's own timestamps.

### B3

Given an incident whose linked intent was committed inside `incident_to_intent_minutes`,
When `harness status` runs,
Then the incident is reported `valid` and `within`, exactly as it is today. The Maintain loop is
not part of what is being retired.

### B4

Given an incident whose linked intent is missing,
When `harness status` runs,
Then it is `INVALID` and the command exits non-zero, exactly as today.

### B5

Given the repository after this change,
When the source is searched,
Then nothing imports `lifecycle.mjs`, and `declaredFiles` and the legacy-plan branch of
`scope-drift` are gone. No gate, check, or indicator reads `layout.spec` or `layout.plan`;
`contract migrate` still does, and is the only thing that may.

### B7

Given a contract whose spec is approved before its intent was accepted, or whose plan is approved
before its spec,
When it is validated,
Then it is invalid. The legacy lifecycle was the only place this ordering was tested, and the
coverage must move rather than die with it.

### B6

Given a contract that is invalid,
When `harness status` runs,
Then it still exits non-zero. Removing the legacy integrity check must not remove integrity.

## Out of scope

The `harness init` prefix-cache defect and `contract-scope-honesty`. Deleting
`.aidlc/archive/legacy-lifecycle/`, which is the historical record and stays. Any change to the
`[sla]` limits themselves.

## Entities and existing context

- `lifecycle()` (`.aidlc/lib/lifecycle.mjs:81`) — the four-KIND walk being retired.
- `incidents()` (`.aidlc/lib/lifecycle.mjs:115`) — the Maintain loop. Not legacy; moves out
  before the file goes.
- `renderLifecycle()` (`.aidlc/lib/lifecycle.mjs:128`) — renders both blocks. The incidents half
  moves with `incidents()`.
- `contractState` — already supplies stage and integrity; `harness status` prints it today as the
  `contracts` block, beside the legacy block that contradicts it.
- `rows()` (`.aidlc/lib/contract-chain.mjs`) — already carries `accepted_at`, `spec_sealed_at`,
  `plan_sealed_at` and the review. It needs the review's approval date to close the last clock.
- `cfg.sla` (`.aidlc/lib/config.mjs:41`) — `intent_hours`, `design_hours`, `planning_hours`,
  `build_hours`, `review_hours`, `incident_to_intent_minutes`. Unchanged; only their source moves.
- `declaredFiles` (`.aidlc/lib/guard.mjs:6`) — parses a legacy plan's `## Files` fence. No
  artifact writes one.

## Approach and rejected alternatives

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

## Structure and ownership

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

## Safeguards

- B3 and B4 pin the Maintain loop's behaviour across the move, unchanged in both directions.
- B2 pins that the SLA survives the deletion rather than leaving with its host.
- B6 pins that integrity still fails the command, so removing the legacy check does not remove
  the gate.
- `.aidlc/archive/legacy-lifecycle/` is untouched: the record of what the old model produced is
  evidence, not dead code.
- `[sla]` limits are not edited, so a change in verdicts would mean the clocks moved, not the
  thresholds.

## Operations

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
| B1 | `harness status` on this repository exits 0 |
| B2 | `test/indicators.test.mjs` — a completed chain reports an SLA verdict |
| B3 | `test/lifecycle-cli.test.mjs` — the incident SLA test, unchanged |
| B4 | `test/lifecycle-cli.test.mjs` — an incident with no intent is INVALID and exits non-zero |
| B5 | `grep` finds no importer of `lifecycle.mjs`, no `declaredFiles`, and no gate reading the legacy dirs |
| B7 | `test/contract.test.mjs` — spec before acceptance, and plan before spec, are both invalid |
| B6 | `test/lifecycle-cli.test.mjs` — an invalid contract still exits non-zero |
