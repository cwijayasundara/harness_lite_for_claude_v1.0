# Program: complete the harness

**Point-in-time plan, written 2026-09-06 from the 2026-09-05 analysis. Delete it when the exit
criterion below is met.** `harness status` is the source of truth for where each change is; this
file only says how the changes fit together and in what order.

## Exit criterion

One command runs one campaign fixture, five sprints, unattended, green, in under thirty minutes
for under five dollars:

    node evals/run.mjs --id campaign-ledger --require-auth

And at that commit: `harness evals gate` compares against an `expected.json` recorded on this
harness; `harness ledger audit` lists nothing under `decide`; `harness status` lists only live
work; exactly one test project exists, inside this repository.

## Why this and not section 5 of the analysis

Section 5 said resume `dunning`. The owner decided on 2026-09-06 that there is one test project,
and it is the campaign. `dunning` and `campaign-legacy` are deleted by `one-integration-test`.
A4, the instruction-surface ablation, waits until the campaign is green, because an ablation
against a moving target measures the movement.

## Phases

| # | what | change | needs a model | gate |
|---|---|---|---|---|
| 0 | close the six delivered changes; delete `docs/RESUME.md` | none | no | none |
| 1 | a product write is permitted by the current change's plan alone | `a-diff-belongs-to-one-change` | one campaign run | owner approves spec, then plan |
| 2 | one brownfield fixture, five sprints; delete `campaign-legacy` and `../dunning` | `one-integration-test` | one campaign run | owner approves spec, then plan; spoken yes before `rm -rf ../dunning` |
| 3 | one full suite run; re-record `expected.json` | `the-suite-measures-this-harness`, steps 6 and 7 | one full run, about ten dollars | already approved |
| 4 | every audit row is keep, review, or gone | `every-control-fires-or-goes` | no | owner approves spec, then plan |

Order is 0, 1, 2, 3, 4. Phase 1 before 2 because sprint 3's exit condition needs phase 1's
guard. Phase 3 after 2 because the re-baseline must include the five-sprint campaign. Phase 4 is
independent and can run whenever a session is waiting on a gate.

## Phase 0, in detail

For each of `a-plan-proves-its-spec`, `a-spec-can-be-superseded`, `campaigns-run-unattended`,
`evolving-scope`, `lean-v2`, `the-suite-measures-this-harness`: read the plan's Proof table, run
the named tests, and if every row holds, set `status: closed` in `intent.md`.
`the-suite-measures-this-harness` stays open until phase 3 lands its steps 6 and 7. `lean-v2` is
closed once `one-integration-test`'s spec, which supersedes B13, is approved. The rest close now.

## Owner's decisions, carried forward

1. `ANTHROPIC_API_KEY` as a repository secret, or CI fails by design on every steering change.
   Still unset on 2026-09-06.
2. Section 6 decision 2: the six gate-approved changes are closed as delivered, not re-implemented.
3. Section 6 decision 3: A3 runs now, as sprints 4 and 5 of the one campaign.
4. Section 6 decision 4: `dunning` gets no remote. It is deleted.

## Standing commands

    .aidlc/bin/harness status
    .aidlc/bin/harness approve <slug> spec --by <you>
    .aidlc/bin/harness approve <slug> plan --by <you>
    .aidlc/bin/harness check --stage stop
    node evals/run.mjs --id campaign-ledger --require-auth
    .aidlc/bin/harness ledger audit
