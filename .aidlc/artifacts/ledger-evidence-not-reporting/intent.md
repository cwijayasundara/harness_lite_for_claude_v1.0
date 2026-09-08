---
status: draft
source: docs/IMPROVEMENT-PLAN.md
source_revision: 89b5c20f6f54dfe06720fd38cb09e69e977d6443
parent: lean-review-ledger-evidence
---
# Intent: ledger-evidence-not-reporting

- **Date:** 2026-09-08
- **Author:** Claude, recording the user's request to take the lean-review
  ledger and development evidence row through the AIDLC workflow
- **Source:** Lean review, 8 September 2026 in `docs/IMPROVEMENT-PLAN.md`, fifth
  disposition row: ledger and development evidence.

## Problem

The row asks for an investigation of true positives and false blocks from the
records already held. That investigation has not been done, and the records say
something the guidance does not.

Across this repository's whole history the ledger holds 7,995 rows, of which 728
are blocks. Three have ever been called false — all `bash-guard/contract-scope`,
all on 2026-09-06. The other 725 are unflagged, and unflagged means
uninvestigated, not correct: nothing in a row records what the block prevented.

Attribution is partial. `bash-guard` and `map-drift` name a rule; `test`,
`write-guard`, `scope-drift` and `tamper` do not, so 53 blocks recorded since
rule labelling landed on 2026-09-03 cannot be reached by
`harness ledger flag <rule>`, which matches on the rule field. A block nobody
can name is a block nobody can call wrong. Of the 128 attributable `bash-guard`
fires, 120 are one rule, `init-force`, about a development convenience flag;
`destructive` and `approve-is-the-humans` fired once each; `contract-scope`
fired six times and was called wrong three, sitting just under the noisy
threshold that needs more than half.

Against that, the audit reports `bash-guard` as `earning-its-place` — keep — on
a 14.9% fire rate, and `map-drift` likewise on 78.4%, which is 105 reminders to
run `harness map`. Fire rate measures how busy a control is. A `[deterrents]`
entry proves a planted defect still reaches a control that never fires. Neither
measures what the control was worth, and the README says the ledger is how
"controls that are noisy or never useful get deleted", which claims a judgement
the ledger has never been able to make: on its own evidence it authorises
deleting only `unreliable` controls, and it has never named one.

Nothing states that limit, so the plausible next step is to close the gap by
measuring harder — a benefit or saving field on a row, a score in the audit, a
scheduled report, an upload — which is the reporting service the row refuses and
the direction v6 took.

## Proposed outcome

The investigation exists, in tracked files, drawn entirely from records already
held: how many blocks were recorded, how they distribute across controls and
rules, which were called false, which cannot be attributed at all, and what an
unflagged block does and does not license.

The guidance says what the ledger measures and what it does not: it records what
fired, how often, and how often a human called a fire wrong; fire rate is
busyness, a seeded deterrent test proves reachability, and only `unreliable`
authorises deletion on the ledger's own evidence.

The limit is held by a test. No benefit, score, saving or ROI field enters a
ledger row, the audit or the registry; the `KILL` thresholds and the verdict set
stay as they are; nothing truncates, rotates, prunes or re-publishes the ledger,
and no server, endpoint, daemon, scheduled job, dashboard or external sink is
added. `ledger export` stays the single, invocation-scoped export it is.

The unattributed-block gap is recorded in `review.md` as a finding with a
recommendation. Emitting a rule from the four controls that do not is a change
to guard machinery and is not made here.

## Affected users and systems

Anyone reading `harness ledger audit` to decide whether a control stays;
engineers reading the README's account of what the ledger does; the local
`.aidlc/state/ledger.jsonl` and the tracked `evals/evidence/`, neither of which
is pruned.

## Constraints

- Do not change `.aidlc/lib/ledger.mjs`, `.aidlc/checks/`, `.aidlc/hooks/` or
  any guard: no new field, threshold, verdict or rule label.
- Do not delete, truncate, rotate or rewrite ledger rows or `evals/evidence/`.
  The only write to a row the harness makes stays the `false` flag a human asks
  for.
- Do not add a control, hook binding, skill, agent or CLI verb, and do not
  change `[limits]`.
- Do not restate a budget number in prose.
- Do not edit another change's approved artefacts, or the approved behaviours of
  `the-ledger-cannot-judge-a-deterrent` and `every-control-fires-or-goes`, whose
  tests keep their exact meaning.

## Open questions

None
