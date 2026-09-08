---
status: draft
---
# Plan: ledger-evidence-not-reporting

## Approach

Read the rows, write down what they say, then state what they cannot say and
hold it with a test. No runtime file is edited, so the whole change is an
investigation record, two prose corrections and one lock.

The numbers in B1 come from grouping the existing `.aidlc/state/ledger.jsonl`
by control, rule and `false` flag, and from splitting blocks at the moment rule
labelling landed. The queries are ad-hoc reads of an untracked local file; they
are not added to the CLI, because a saved query is the first turn of the
reporting service the row refuses. The record therefore carries its own date and
window so a later reader can tell it is a snapshot.

`test/ledger-evidence.test.mjs` is the lock. It reads the shipped
`.aidlc/lib/ledger.mjs`, `.aidlc/bin/harness` and the guidance, and fails when a
benefit, value, score, saving, ROI, impact or cost field enters a row, the
`KILL` thresholds, the verdict set or the audit result keys; when a `harness
ledger` subcommand beyond `audit`, `flag` and `export` appears; when anything
truncates, rotates, prunes or serves the ledger; or when the guidance stops
saying what a fire rate and a seeded deterrent test prove.

Only the guidance assertions fail before the prose edits; the rest describe a
surface that is already correct. Each of those is verified to fail under a
deliberate temporary mutation of the surface it guards before that mutation is
reverted, so the lock is proved to bite.

The alternative considered and rejected in the spec is emitting a rule from the
four controls that record a block without one. It is recorded in `review.md` as
a recommendation, not taken here.

## Files

- `test/ledger-evidence.test.mjs`
- `README.md`
- `docs/IMPROVEMENT-PLAN.md`

## Order

1. Re-run the grouping queries against `.aidlc/state/ledger.jsonl` and write the
   investigation into `.aidlc/artifacts/ledger-evidence-not-reporting/review.md`:
   rows, blocks, distribution by control and rule, the three flagged false, the
   unattributable blocks since labelling, the `init-force` concentration, what
   an unflagged block does not license, and the recommendation about rule
   labels, with the date and window on the record.
2. Add `test/ledger-evidence.test.mjs` with the B1–B4 assertions. Confirm the
   guidance assertions fail and the rest pass, then confirm each already-passing
   assertion fails under a temporary mutation of the surface it guards.
3. Correct the README's ledger line so it no longer says the ledger decides
   which controls are useful, and state there what a fire rate and a
   `[deterrents]` entry each prove, and that only `unreliable` authorises
   deletion on the ledger's own evidence.
4. Rewrite the lean-review ledger row in `docs/IMPROVEMENT-PLAN.md` to carry the
   investigation's summary figures, the decision, and what it forbids.
5. Run `harness check --stage stop`, then `--stage commit`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `.aidlc/artifacts/ledger-evidence-not-reporting/review.md` and the lean-review ledger row in `docs/IMPROVEMENT-PLAN.md`, both carrying the counts, the three false blocks, the unattributable blocks and the date and window; `test/ledger-evidence.test.mjs` asserts the row states that an unflagged block is uninvestigated and that this is local development history, not a product-benefit sample |
| B2 | `test/ledger-evidence.test.mjs`: the README ledger section states what a fire rate measures, what a `[deterrents]` entry proves, and that only `unreliable` authorises deletion on the ledger's own evidence, and no longer claims the ledger decides usefulness; `test/unit.test.mjs` keeps proving the audit's actual verdicts and actions unchanged |
| B3 | `test/ledger-evidence.test.mjs`: `.aidlc/lib/ledger.mjs` writes rows only by append except the human-requested `false` flag, which still preserves verdict, rule, timestamp and run; `harness ledger` exposes only `audit`, `flag` and `export`; no truncate, rotate, prune, serve, listen, upload or schedule appears; `test/ledger-export.test.mjs` keeps proving the export contract and its invocation scope |
| B4 | `test/ledger-evidence.test.mjs`: the row schema, `KILL` thresholds, verdict set and audit result keys are exactly the frozen sets and carry no benefit, value, score, saving, ROI, impact or cost field; `test/unit.test.mjs` keeps proving the thresholds and verdicts behave as approved |

## Gate status

Prepared for review. Spec and plan remain drafts. Implementation starts after
the user's `harness approve` of spec, then plan.
