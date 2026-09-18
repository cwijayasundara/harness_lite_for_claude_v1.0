---
status: closed
migrated_from: aidlc.contract/v1
---
# Intent: retire-the-legacy-lifecycle

- **Status:** approved
- **Author:** cwijayasundara

## Problem

Two artifact models have coexisted since the delivery contract replaced `spec.md` and `plan.md`
with sealed sections of one file. The legacy one is still wired in, and it has now produced five
separate defects in one session:

1. `harness status` reports `INVALID` and exits 1 for a change taken correctly through the
   contract chain, because `lifecycle.mjs:5` demands `spec/<slug>.md` and `plan/<slug>.md`.
2. `evals/fixtures/_base` wired `plan-drift`, so no eval covered contract scope enforcement.
3. `plan-drift` is a stage name with no implementation — `runner.mjs:15` registers only
   `secrets`, `scope-drift` and `budget`.
4. `scope-drift` carries a legacy-plan branch and `guard.mjs` still exports `declaredFiles` for a
   `## Files` block no artifact writes.
5. The playbook indicators were computed from the legacy chain and printed `unmeasured` while
   real work went through contracts — fixed by `indicators-on-the-contract-chain`, which is what
   makes this retirement possible.

`.aidlc/archive/legacy-lifecycle/` already holds every artifact the old model was written for.

## Outcome

One artifact model. `harness status` exits 0 for a healthy repository, and no code path reads a
`spec.md` or `plan.md`.

## Affected systems

`.aidlc/lib/lifecycle.mjs`, `.aidlc/bin/harness`, `.aidlc/lib/paths.mjs`,
`.aidlc/lib/guard.mjs`, `.aidlc/checks/scope-drift.mjs`, and their tests.

## Constraints

This is a deletion, and two things inside the file being deleted are not legacy and must survive
intact:

- **`incidents()`** is the Maintain loop — a control-band breach reaching an intent inside its
  SLA. It has nothing to do with the four-file chain.
- **The per-change SLA clocks** are a governance feature the playbook asks for. Dropping them
  while removing their host would be a requirement quietly abandoned, which is the failure mode
  this whole line of work exists to stop.

Nothing may be deleted before its replacement is proven. `contractState` already supplies stage
and integrity; the SLA clocks need re-basing onto the contract chain first.

## Open questions

Whether any repository has installed this harness and is mid-flight on the legacy model. The
harness is declared by version rather than copied, so the answer is knowable from
`harness-install.json`, and a pre-v1 project can stay pinned to an earlier commit.
