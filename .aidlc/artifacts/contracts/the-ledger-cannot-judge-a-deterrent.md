# Delivery contract: the-ledger-cannot-judge-a-deterrent

- **Schema:** aidlc.contract/v1
- **Change id:** the-ledger-cannot-judge-a-deterrent
- **Intent ref:** ../intent-refs/the-ledger-cannot-judge-a-deterrent.json
- **Story ref:** none
- **Risk:** standard
- **Spec status:** approved
- **Spec approval digest:** sha256:fb47259ee42168473e60a51802e206f6071be592ec5573f514b59c471b9b34c6
- **Plan status:** approved
- **Plan approval digest:** sha256:70db28a851dfa19a95806aaed9e5b3a03f5f9e132cfc6091e8cd6c92eac35055

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

## Approach and rejected alternatives

The audit gains the set of controls a stage can reach, and uses it to split "did not fire" from
"did not run". `deletions` narrows to what the ledger can justify alone; everything needing the
control's `why:` moves to `decide`.

Rejected: deleting `budget` as the audit advised. It fires when crossed, the repository sits
exactly at its limits, and CLAUDE.md makes the constraint load-bearing. Removing it would delete
the reason the limit has never been crossed — and it would be the harness's own subtractive
mechanism destroying a working control, which is a worse outcome than leaving one dead one in
place.

Rejected: treating `unwired` as automatically deletable. `arch` and `test_quality` run under the
gauntlet; unreachable from a stage is a reason the ledger cannot judge them, not proof they are
worthless.

Rejected: dropping the zero-fire verdict entirely and reporting only fire rates. It would remove
the audit's ability to raise the question at all, which is most of its value.

Rejected: inferring deterrence automatically — for example, treating a control as a deterrent when
its measured value sits at its configured limit. It works for `budget` and generalises to nothing;
the honest signal is the control's `why:`, which is prose a person reads.

## Structure and ownership

| Path | Change |
|---|---|
| `.aidlc/lib/ledger.mjs` | `unwired` and `never-fired` verdicts; `deletions` narrowed, `decide` added |
| `test/unit.test.mjs` | B1 to B5 |

## Safeguards

- B4 and B5 pin the verdicts that were already right, so the change is additive rather than a
  reclassification of everything.
- `KILL` is untouched: a different verdict must come from different reasoning, not a moved
  threshold.
- `deletions` narrowing is the point — an audit that recommends deleting a working control is
  worse than one that recommends nothing.
- B6 checks the result against the repository that exposed the defect, so the fix is measured on
  the case that produced it.

## Operations

1. Pass the stage-reachable control names into `report`/`audit`.
2. Add the `unwired` verdict for controls no stage reaches.
3. Rename `candidate-for-deletion` to `never-fired` and rewrite its action to raise the deterrent
   question instead of instructing a deletion.
4. Narrow `deletions` to `unreliable`; add `decide` for `never-fired` and `unwired`.
5. Add B1 to B5 to `test/unit.test.mjs`.
6. `harness check --stage commit`, then read `harness ledger audit` for B6.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/unit.test.mjs` — a staged control with no fires reads `never-fired` |
| B2 | `test/unit.test.mjs` — a control no stage reaches reads `unwired` |
| B3 | `test/unit.test.mjs` — `deletions` holds only unreliable controls; the rest are `decide` |
| B4 | `test/unit.test.mjs` — a firing control still earns its place |
| B5 | `test/unit.test.mjs` — a staged control under the threshold is still `insufficient-data` |
| B6 | `harness ledger audit` on this repository |
