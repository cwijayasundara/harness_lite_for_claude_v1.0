---
status: closed
---
# Intent: every-control-fires-or-goes

- **Date:** 2026-09-06
- **Author:** cwijayasundara
- **Source:** the 2026-09-05 analysis, A5, and `harness ledger audit` on 2026-09-06.

## Problem

The audit lists seven controls under `decide`, and it has said so for weeks:

| control | rows | reading |
|---|---:|---|
| `budget` | 163, 0 fired | a deterrent at its limit, or nothing |
| `arch` | 76, 0 fired | same |
| `test_quality` | 76, 0 fired | same |
| `graph-refresh` | 79, 0 fired | telemetry recorded as a control; it has no defect to fire on |
| `map-drift` | 86, 100% fired | recorded at Stop but not named as a hook control, so judged unwired; and a control that fires every time is measuring nothing |
| `plan-drift` | 20 | deleted from every registry by `no-name-points-at-nothing`; the rows are older than the deletion |
| `hook:pre-bash` | 1 | one row from a binding that was merged away |

`the-ledger-cannot-judge-a-deterrent` made the audit stop recommending these for deletion. It did
not make anyone decide, and a "decide" that stands for a month is a row nobody reads.

## Proposed outcome

Every control in the audit is `keep`, `review`, or gone. A deterrent proves it fires by a named
test and the audit says so. Telemetry is not judged as a control. Retired names age out without a
verdict. `map-drift` fires when the map is stale and passes when it is not.

## Affected users and systems

- `.aidlc/lib/ledger.mjs` `report` and `audit`.
- `.aidlc/harness.toml`, the one hand-edited registry, if a deterrent needs to name its proof.
- `.aidlc/hooks/dispatch.mjs` and `.aidlc/lib/map.mjs` for `map-drift`.
- `.aidlc/lib/refresh.mjs` for `graph-refresh`.

## Constraints

- Law 11: this adds no control. It fixes what the audit says and repairs one control that misfires.
- The budget is full and stays full. `budget` is the control that keeps it so, and deleting it
  because it never fired is the mistake the deterrent change already named.
- Zero dependencies, no new skill, no new binding.

## Open questions

- **Why does `map-drift` fire on every Stop?** Either the map is never regenerated at Stop, or the
  drift comparison is wrong. Answered by reproducing it in a unit test before any fix.
