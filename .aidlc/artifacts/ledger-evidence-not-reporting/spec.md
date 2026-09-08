---
status: approved
source: docs/IMPROVEMENT-PLAN.md
source_revision: 89b5c20f6f54dfe06720fd38cb09e69e977d6443
parent: lean-review-ledger-evidence
source_digest: sha256:2e64c4ed6691644341f99b9f8144895a12e8c217c225102bf0c1357b2195aa1b
source_kind: repository
intent_digest: sha256:a85bbe0b6eac15d37aac843a19fc2e98589d099039f6a221e36471f371316534
intent_input_digest: sha256:5d88bcc19f754724e7943ea61a18dd6e4b738e203524e607929e66e9b07b8422
intent_revision: b25f7f76994b50eced11a9f718f9ed191bd55a28
by: cwijayasundara
at: 2026-09-08T21:55:39.092Z
digest: sha256:f074341b9d073ed0b9f01a982ebb9ca9c9807aa63fa2bd052b1ddf0faa726d2c
approval_version: 2
approval_digest: sha256:58cd43af52fa06fd5732adaeb42bd3cb9822b263dd69d222873cd721f0451ffd
---
# Spec: ledger-evidence-not-reporting

## Outcome

The blocks the ledger already recorded have been investigated and the result is
written down. The guidance says what fire counts and seeded deterrent tests
prove and what they do not, so nobody reads `earning-its-place` as a benefit
measurement. Historical evidence is retained untouched, and a test refuses the
next step v6 took: measuring harder by adding a benefit field, a score, a
schedule or a place to publish to.

## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| local:investigate-true-positives-and-false-blocks-from-existing-records | B1 |
| local:fire-frequency-and-seeded-tests-do-not-measure-benefit | B2, B4 |
| local:retain-evidence-without-a-reporting-service | B3, B4 |

## Observable behaviours

### B1

Given the ledger rows this repository has already accumulated,
When a reader asks what the harness's blocks have been worth,
Then `review.md` for this change and the lean-review ledger row in
`docs/IMPROVEMENT-PLAN.md` record the investigation from those records: the
number of rows and of blocks, their distribution by control and by rule, the
three `bash-guard/contract-scope` blocks a human called false, the count of
blocks recorded since rule labelling that carry no rule and so cannot be reached
by `harness ledger flag`, and the concentration of attributable `bash-guard`
fires in `init-force`. The record states plainly that an unflagged block is
uninvestigated rather than a true positive, that this is local development
history and not a product-benefit sample, and it names the date it was taken.

### B2

Given `harness ledger audit` and the README's account of the ledger,
When a reader decides whether a control stays,
Then the guidance says that the ledger records what fired, how often, and how
often a human called a fire wrong; that a fire rate measures how busy a control
is and not what it prevented; that a `[deterrents]` entry proves a planted
defect still reaches a control that never fires, and not that the control pays
for itself; and that on its own evidence the audit authorises deleting only an
`unreliable` control, leaving `never-fired` and `unwired` as questions for a
person holding the control's `why:`. No claim survives that the ledger decides
usefulness.

### B3

Given `.aidlc/state/ledger.jsonl` and the tracked evidence under
`evals/evidence/`,
When the harness runs any command,
Then rows are only appended, and the only write to an existing row remains the
`false` flag `harness ledger flag` sets at a human's request, leaving verdict,
rule, timestamp and run exactly as the guard wrote them. Nothing truncates,
rotates, prunes, archives or re-publishes the ledger; `ledger export` remains
the single export, scoped to one invocation, written to stdout by the caller.
No server, listening port, endpoint, daemon, scheduled job, dashboard, upload or
external sink is added, and `evals/evidence/` is not deleted or summarised away.

### B4

Given a ledger row, the audit result and `.aidlc/harness.toml`,
When someone proposes to measure net benefit,
Then the row schema, the `KILL` thresholds, the verdict set and the audit's
result keys are unchanged, and no benefit, value, score, saving, ROI, impact or
cost field appears in any of them. A test fails if one does, if a new reporting
or publishing verb appears under `harness ledger`, or if the guidance stops
stating what fire counts and deterrent tests prove.

## Design

This is an investigation and a freeze, not a mechanism. `.aidlc/lib/ledger.mjs`,
the checks, the hooks and the guards are not edited: the numbers come from
reading the rows the harness already wrote, and the limit is stated in prose and
held by one new test file, `test/ledger-evidence.test.mjs`, in the same shape as
`test/limit-coordination.test.mjs` and `test/host-evidence.test.mjs`.

The rejected alternative is closing the attribution gap now by emitting a rule
from `test`, `write-guard`, `scope-drift` and `tamper`. It is the right shape of
fix — it makes existing blocks investigable rather than adding a metric — but it
edits four guards to serve a measurement question, and the row asks for the
records to be used before the machinery is grown. It is recorded in `review.md`
as a recommendation with the 53 blocks that motivate it.

Also rejected is rewording the audit's `keep — proven by <test>` line. Read with
its `why:`, it claims the control is a deterrent rather than a corpse, which is
what the seeded test does prove, and `the-ledger-cannot-judge-a-deterrent`
approved that wording. Correcting the README's stronger claim reaches the same
reader without reversing an approved behaviour.

## Out of scope

- Any change to ledger, check, hook or guard behaviour, including rule labels.
- New fields, thresholds, verdicts, result keys or `harness ledger` subcommands.
- Retention, rotation, archival or migration of ledger rows or evidence.
- Reworking `harness ledger audit` output or the `deterrent` verdict wording.
- A product-benefit measurement of any kind; the row says this local history is
  not one, and no paid trial is run to obtain one.

## Safeguards

- `test/unit.test.mjs` and `test/ledger-export.test.mjs` keep their exact
  meaning, so the approved behaviours of `the-ledger-cannot-judge-a-deterrent`,
  `every-control-fires-or-goes` and the export contract are untouched.
- The recorded numbers are reproducible from the rows: the record names the
  date, the window and the fact that the ledger is untracked local state, so a
  later reader can tell a stale figure from a current one.
- No row is rewritten, so the investigation cannot damage its own evidence.
- The freeze test must fail on a real addition, not a rename, so it reads the
  shipped `.aidlc/lib/ledger.mjs`, `.aidlc/bin/harness` and the guidance rather
  than a list it also writes.
