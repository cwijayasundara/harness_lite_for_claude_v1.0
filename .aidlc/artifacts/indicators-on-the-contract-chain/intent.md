---
status: draft
migrated_from: aidlc.contract/v1
---
# Intent: indicators-on-the-contract-chain

- **Status:** approved
- **Author:** cwijayasundara

## Problem

The AI-native SDLC playbook makes measurement a governance requirement: every stage carries a
leading and a lagging indicator, and "the chain of commits is the audit trail". This harness
implements those as `playbookIndicators` — intent survival, time to committed intent, design
hours, intent rework after spec, spec rework after plan, first-pass review.

All of them are computed from `lifecycle()`, which walks the pre-contract four-file chain
`intent -> spec -> plan -> review` (`.aidlc/lib/lifecycle.mjs:5`). The delivery contract replaced
the middle two with sealed sections of one artifact. So the measurement layer reads a model the
repository no longer produces, and every indicator except eval pass rate has been printing
`unmeasured` while real work went through the contract chain.

The same split has now produced four separate defects:

1. `harness status` reports `INVALID` and exits 1 for a change taken correctly through the
   contract chain — `status-grades-two-lifecycles`.
2. `evals/fixtures/_base` wired `plan-drift`, so no eval covered contract scope enforcement.
3. `plan-drift` is a stage name with no implementation: `runner.mjs:15` registers only `secrets`,
   `scope-drift` and `budget`. The 20 ledger invocations are historical.
4. `scope-drift` still carries a legacy-plan branch and `guard.mjs` still exports `declaredFiles`
   for the `## Files` block no artifact writes any more.

Deleting the legacy lifecycle is the right end state, but deleting it first would delete the
measurement with it. The indicators have to move before the model they read can go.

## Outcome

Every playbook indicator is computed from the contract chain — intent ref decision, contract spec
and plan seals, review artifact — and reports a real number for the work done in this repository.

## Affected systems

`.aidlc/lib/indicators.mjs`, a contract-chain row source, the `status` rendering in
`.aidlc/bin/harness`, and a written conformance mapping under `docs/`.

## Constraints

Zero dependencies. No indicator may be dropped to make the migration easier: an indicator that
stops being computed is a governance requirement quietly abandoned. `lifecycle.mjs` stays in place
and untouched by this change so the diff is reviewable; its deletion is the next contract.

## Open questions

`spec rework after plan` counted commits to `spec.md` after `plan.md` was approved. Spec and plan
are now sections of one file, so commit counting no longer separates them — but each section
carries its own approval digest, so a spec digest that changes after the plan seal is a more
precise signal than the commit proxy ever was. Confirm that reading in the contract.
