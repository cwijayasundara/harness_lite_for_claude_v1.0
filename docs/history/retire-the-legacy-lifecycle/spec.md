---
status: draft
migrated_from: sha256:4f5297e15ee793830e762c37b1ed072fbf08bcf8e3cc123e6d504214b25b2831
---
# Spec: retire-the-legacy-lifecycle

## Outcome

One artifact model, and `harness status` exits 0 for a repository whose contracts are healthy.

## Observable behaviours

### B1

Given this repository, whose changes all went through the contract chain,
When `harness status` runs,
Then the output carries no `spec` or `plan` next-stage row and no legacy integrity error, and the
only causes of a non-zero exit are real findings.

Originally this said "exits 0", which conflated two claims: that the legacy lifecycle is gone, and
that this repository is healthy. They are different. `status` currently exits 1 because
`p0-unblock-the-loop`'s review elapsed 46 hours against a 24-hour `review_hours` limit — a true
breach, correctly reported. Raising the limit to reach zero would be moving a threshold to change
a verdict, which is the thing this harness exists to prevent.

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

## Safeguards

- B3 and B4 pin the Maintain loop's behaviour across the move, unchanged in both directions.
- B2 pins that the SLA survives the deletion rather than leaving with its host.
- B6 pins that integrity still fails the command, so removing the legacy check does not remove
  the gate.
- `.aidlc/archive/legacy-lifecycle/` is untouched: the record of what the old model produced is
  evidence, not dead code.
- `[sla]` limits are not edited, so a change in verdicts would mean the clocks moved, not the
  thresholds.

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
