---
status: draft
source: docs/IMPROVEMENT-PLAN.md
source_revision: 088a3a0911faba198a79a7431185a270b85d64dc
parent: lean-review-ledger-evidence
---
# Intent: a-block-names-its-rule

- **Date:** 2026-09-09
- **Author:** Claude, recording the user's decision to act on the recommendation
  in the block investigation
- **Source:** the lean-review ledger row in `docs/IMPROVEMENT-PLAN.md` at
  `088a3a0` and finding F2 in
  `.aidlc/artifacts/ledger-evidence-not-reporting/review.md`; the user's
  decision of 2026-09-09 to take the recommendation.

## Problem

`harness ledger flag <rule>` is the only way a human can record that a block was
wrong, and `ledger.flag()` matches on a row's `rule` field. Only `bash-guard`
and `map-drift` set one. Since rule labelling landed on 2026-09-03, `test` has
recorded 29 blocks, `scope-drift` 14, `write-guard` 10 and `tamper` 1 with no
rule at all — 54 blocks a human who judged one wrong had nowhere to say so about,
and 54 the audit's per-rule split, the only part that asks whether being busy
was useful, cannot see.

The information exists and is thrown away. `scope-drift` already builds findings
tagged `scope-drift`, `unkept-proof`, `draft-awaits-gate`, `no-approved-plan`,
`no-current-change` and `plan-scope-missing`; `tamper` tags `bare-suppression`,
`raised-threshold` and `deleted-test`; the `test` control tags `test-failed`.
The runner prints those tags to the operator and then appends a ledger row
without them. `write-guard` is the one control that genuinely has no tag:
`writeBlocked` returns a refusal message and nothing that names which of its
refusals fired.

This is a defect in existing machinery, not a missing control. The row it comes
from refuses new measurement; making a block the harness already records
nameable is the opposite of that — it makes the records already held
investigable.

## Proposed outcome

Every block the harness records names the rule that produced it. A human who
hits one runs `harness ledger flag <rule>` and it lands; the audit's per-rule
split covers every control that fires, so a rule that blocks the wrong thing
more often than the right thing becomes visible instead of averaging into its
control's fire rate.

Nothing is measured that was not measured before. No field is added to the row
schema — `rule` is already there — no threshold, verdict or subcommand appears,
and the limits `ledger-evidence-not-reporting` froze are untouched.

## Affected users and systems

Anyone running `harness ledger audit` or `harness ledger flag`; the stage runner
and the pre-write hook, which append the rows; `writeBlocked` and its callers.

## Constraints

- Do not add a ledger field, threshold, verdict, subcommand or reporting path;
  `test/ledger-evidence.test.mjs` holds all of those and must keep passing
  unedited.
- Do not change what any guard blocks. This change alters what a block is
  called, never whether it happens.
- Do not add a control, hook binding, skill, agent or CLI verb, and do not
  change `[limits]`.
- Rows that pass carry no rule; only a block names one.
- Existing `bash-guard` and `map-drift` rule names are unchanged, so the history
  already recorded under them stays comparable.
- Do not rewrite historical rows to backfill a rule; the 54 already recorded
  stay as the guards wrote them.

## Open questions

None
