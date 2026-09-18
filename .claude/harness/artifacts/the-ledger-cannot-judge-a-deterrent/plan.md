---
status: draft
migrated_from: sha256:70db28a851dfa19a95806aaed9e5b3a03f5f9e132cfc6091e8cd6c92eac35055
---
# Plan: the-ledger-cannot-judge-a-deterrent

## Approach

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

## Files

| Path | Change |
|---|---|
| `.aidlc/lib/ledger.mjs` | `unwired` and `never-fired` verdicts; `deletions` narrowed, `decide` added |
| `test/unit.test.mjs` | B1 to B5 |

## Order

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
