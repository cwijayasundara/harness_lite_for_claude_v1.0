---
status: draft
---
# Review: ledger-evidence-not-reporting

Written by the evaluator against `spec.md` and `.aidlc/policies/review.md`. Every finding cites a
behaviour id or a review pass, and carries a severity.

## Block investigation (B1)

Taken 2026-09-09 from `.aidlc/state/ledger.jsonl`, covering every row this
repository has accumulated: 2026-08-24T06:05:19Z to 2026-09-09T04:47:27Z,
8,075 rows over 630 runs, 729 of them blocks. The ledger is untracked local
state, so these figures are a dated snapshot of this machine's development
history and not a product-benefit sample. Nothing here was measured against a
control group, and no paid trial was run to obtain one.

| Control | Blocks | Before rule labelling | Since, with no rule | Rules |
|---|---:|---:|---:|---|
| `bash-guard` | 492 | 364 | 0 | `init-force` 120, `contract-scope` 6 (3 called false), `destructive` 1, `approve-is-the-humans` 1 |
| `map-drift` | 105 | 0 | 0 | `stale-map` 105 |
| `test` | 80 | 51 | 29 | — |
| `scope-drift` | 18 | 4 | 14 | — |
| `write-guard` | 16 | 6 | 10 | — |
| `secrets` | 10 | 10 | 0 | — |
| `plan-drift` | 7 | 7 | 0 | — |
| `tamper` | 1 | 0 | 1 | — |

Rule labelling landed on 2026-09-03T17:08Z, which is why `bash-guard`'s history
splits cleanly at that timestamp.

### F1 — three blocks in 729 have ever been called false, and the rest are not therefore true positives

The only false blocks on record are three `bash-guard/contract-scope` fires on
2026-09-06. The other 726 are unflagged, and unflagged means nobody looked. A
row records that a control fired, its stage, its duration and its finding count;
nothing in it records what the block prevented, so no query over these rows can
separate a caught mistake from a refusal that cost ten minutes. The audit's
`earning-its-place` verdict is a statement about fire rate and error rate. It is
not a statement about worth, and the row this change implements says so.

### F2 — 54 blocks since labelling cannot be reached by the only mechanism for calling a block wrong

`harness ledger flag <rule>` matches on the `rule` field (`.aidlc/lib/ledger.mjs`
`flag()`), and only `bash-guard` and `map-drift` emit one. Since labelling
landed, `test` has recorded 29 blocks, `scope-drift` 14, `write-guard` 10 and
`tamper` 1 with no rule at all. A human who hits one of those and judges it
wrong has nowhere to record that judgement, and `report()`'s per-rule split —
the only part of the audit that asks whether being busy was useful — never sees
them.

**Recommendation, not taken here.** Emit a rule from those four controls. It is
the right shape of fix: it makes blocks the harness already records
investigable, rather than adding a metric. It is not taken in this change
because it edits four guards to serve a measurement question, and the review row
asks for the records to be used before the machinery grows. `write-guard` and
`scope-drift` already distinguish named rules internally, so for those two the
change is likely to be a field on a row the guard already builds.

### F3 — the busiest control's usefulness rests on one rule about a convenience flag

Of `bash-guard`'s 128 attributable fires, 120 are `init-force`, refusing
`harness init --force`. `destructive` and `approve-is-the-humans` fired once
each — arguably the two most valuable blocks in the whole record, and each is a
single row. `contract-scope` fired six times and three were called wrong; at
exactly half it sits just under the `noisy` threshold, which needs more than
half. So the control the audit rates most confidently owes 94% of its
attributable fires to a development convenience, and its most error-prone rule
is invisible to the noise check by one row.

### F4 — `map-drift`'s 78.4% fire rate is 105 reminders, not 105 defects

Every `map-drift` block is `stale-map`: `CODEBASE-MAP.md` no longer describes the
tree and `harness map` should be run. That is worth doing — the map answered
from a deleted file for eleven days — but a fire rate this high measures how
often the map goes stale during development, not what the control prevented. It
is the clearest case in the record that frequency and value are different axes.

### F5 — the README claimed a judgement the ledger has never made

`README.md` said the ledger is how "controls that are noisy or never useful get
deleted instead of accumulating". On its own evidence the audit authorises
deleting only `unreliable` controls, and it has never named one; `never-fired`
and `unwired` are printed as questions for a person holding the control's
`why:`, and `budget` is the standing example of a zero-fire control whose
deletion would have removed the reason the limit was never crossed. Corrected
under B2.

## Findings

| Severity | Cites | Finding |
|---|---|---|

## Evidence and uncertainty

<Checks actually observed, unverified paths and limits of the review. Do not claim tests ran
without evidence. The caller runs checks separately from the evaluator.>

## Recommendation

<approve | changes-requested, and why in one sentence.>

## Design and delivery context

Classify discrepancies as authorized rule changes, preserved-behavior refactors, or bugs to fix
against the approved contract. Cite source/behavior and design references at exact revisions.
Inspect `harness graph query product --revision <commit>` where delivery records exist; retain
unknown coverage and conflicts. Approval is a proposal, integration is repository state, and
neither establishes deployment. Do not infer executed proof from a filename or graph edge.
