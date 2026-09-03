---
status: draft
migrated_from: sha256:fb47259ee42168473e60a51802e206f6071be592ec5573f514b59c471b9b34c6
---
# Spec: the-ledger-cannot-judge-a-deterrent

## Outcome

The audit tells a control that did not fire apart from one that did not run, and never asserts a
deletion it cannot justify.

## Observable behaviours

### B1

Given a control named by a stage, with at least `min_sessions` invocations and no fires,
When the audit runs,
Then its verdict is `never-fired`, and the action names the deterrent possibility rather than
instructing a deletion.

### B2

Given a control reachable from neither a stage nor a hook binding,
When the audit runs,
Then its verdict is `unwired` and the action is to wire it or remove it — not to wait for
invocations that cannot arrive.

A control reached only by a hook — `bash-guard`, `write-guard`, `graph-refresh` — is wired. The
ledger sees it constantly; it simply is not named in `[stages]`. Judging it unwired would condemn
the three most active controls in the repository.

### B3

Given the audit output,
When `deletions` is read,
Then it contains only controls the ledger can justify removing on its own evidence: those that
error too often to be trusted. `never-fired` and `unwired` appear under `decide`, because both
need a human to read the control's `why:`.

### B4

Given a control that fires at or above `min_fire_rate`,
When the audit runs,
Then it is `earning-its-place`, exactly as today.

### B5

Given a control with fewer than `min_sessions` invocations that *is* named by a stage,
When the audit runs,
Then it is `insufficient-data`, exactly as today. Not enough evidence yet is a different answer
from evidence that cannot arrive.

### B6

Given this repository,
When `harness ledger audit` runs,
Then `budget` reads `never-fired`, `arch` and `test_quality` read `unwired`, and `deletions` is
empty.

## Out of scope

Deleting, wiring, or otherwise changing `budget`, `arch` or `test_quality`. This changes what the
audit says about them; what to do about it is the decision the audit now correctly hands back.
The `KILL` thresholds, which were never the problem.

## Safeguards

- B4 and B5 pin the verdicts that were already right, so the change is additive rather than a
  reclassification of everything.
- `KILL` is untouched: a different verdict must come from different reasoning, not a moved
  threshold.
- `deletions` narrowing is the point — an audit that recommends deleting a working control is
  worse than one that recommends nothing.
- B6 checks the result against the repository that exposed the defect, so the fix is measured on
  the case that produced it.

## Entities and existing context

- `report` / `audit` (`.aidlc/lib/ledger.mjs:48,80`) — the classification and the action table.
- `KILL` (`.aidlc/lib/ledger.mjs:40`) — `min_sessions: 50`, `min_fire_rate: 0.05`,
  `max_error_rate: 0.10`. Unchanged.
- `candidate-for-deletion` — today's verdict for zero fires, with the action "DELETE — never
  fired; remove it and run the eval suite". This is the assertion being withdrawn.
- `cfg.stages` (`.aidlc/harness.toml`) — `fast`, `stop`, `commit`, `drift`. A control reachable
  from none of them never runs during a check, which is the only thing the ledger observes.
- `budget` proof: at the current limits it passes; with the skills limit lowered by one it returns
  `fail` with `budget/skills | skills = 10, limit 9`. It fires when crossed.
