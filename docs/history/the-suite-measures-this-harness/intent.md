---
status: closed
---
# Intent: the-suite-measures-this-harness

- **Date:** 2026-09-05
- **Author:** cwijayasundara
- **Source:** `.aidlc/artifacts/evolving-scope/evidence.md` F16, F18, F19

## Problem

The golden suite has not measured this harness since the day the harness changed shape.

`lean-v2`'s Sprint 1 replaced `.aidlc/artifacts/contracts/<name>.md` with
`.aidlc/artifacts/<slug>/{intent,spec,plan}.md` and migrated twenty-three contracts. Three things
downstream of the artifact model were never re-checked, and each has been silently wrong since.

**The tasks describe a harness that no longer exists.** `contract-is-testable`,
`contract-names-owned-files` and `successor-contract-links-first` assert paths under
`.aidlc/artifacts/contracts/`, a directory the migration deleted. They have failed every run since,
and the last full run before 2026-09-04 predates the migration, so nobody saw it.

**The baseline predates the change it grades.** `evals/expected.json` was recorded at
`2026-09-03T05:44:07Z` against commit `4616d9e1`, before Sprint 1 landed. `harness evals gate`
has been comparing a post-migration harness against a pre-migration baseline.

**The budgets are fitted to the old shape.** Cost per task roughly quadrupled — `surgical-fix`
$0.376 to $1.871, `test-integrity` $0.418 to $1.686 — because a task that once wrote one contract
file now writes three artifacts and runs `approve` twice. Four tasks exhausted a $0.75 ceiling after
29 to 50 turns and were recorded `inconclusive` or `flaky`.

The last is the one that hides the others. The suite got *cheaper* while its pass rate collapsed —
$8.37 against a $13.76 baseline — because tasks aborted before finishing. A summary line reading
"cheaper than last time" is what a healthy run and a broken one both look like.

Related and separate: only three of twenty-four specs read `status: approved`, because the
migration deliberately invented no approvals. Every control keyed on `approved` therefore inspects
13% of the repository, including the check whose purpose is finding specs that have become fiction.

## Proposed outcome

A full suite run says something true about the harness that is in the repository today.

## Affected users and systems

- `evals/tasks.json` — the three tasks that assert the old layout, and the per-task ceilings.
- `evals/expected.json` — the baseline, re-recorded from a measured run.
- Anything keyed on `status: approved`, which today means three changes out of twenty-four.
- `harness evals gate`, which is only as honest as the baseline it reads.

## Constraints

- **A re-baseline is not a way to make failures acceptable.** Each of the eleven tasks that moved
  off `pass` is either a task describing the wrong harness, a budget fitted to the wrong shape, or
  a real regression. The third kind must be separated from the first two before anything is
  recorded, and recorded as `fail` if it is still failing.
- Re-recording requires a real run, which costs money. The last full run was $8.37 with four tasks
  aborting; a run where they complete will cost more.
- No new control. This is a fix to things that stopped describing reality.

## Open questions

- **What does `approved` mean for a migrated change?** The twenty-three carry `migrated_from` and no
  approval, correctly — inventing one would be worse. But leaving them draft makes every
  `approved`-keyed control near-blind. A third state, or a different key, or accepting the blindness
  with the reason written down. Answered by: the spec.
- **Do the three stale tasks get repointed or retired?** They test contract testability, ownership
  and successor links — all of which still exist in the three-file chain. Repointing is likely, but
  confirm each still tests something the chain does before rewriting its assertions.
- **What are the new ceilings?** Measured, not guessed, and from a run where the tasks finish.
