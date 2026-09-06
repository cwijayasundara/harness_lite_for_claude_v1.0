---
status: approved
by: cwijayasundara
at: 2026-09-06T05:27:40.732Z
digest: sha256:2164e29f1e230db86e09ee7718c8ea8a9709282d2c4aab3a33d3cb2a8ad40768
---
# Spec: every-control-fires-or-goes

## Outcome

`harness ledger audit` on this repository reports no `decide` rows, and every row it does report
is a decision the ledger can defend.

## Observable behaviours

### B1 — a deterrent names its proof

Given a control that has never fired in production,
When `[deterrents]` in `harness.toml` maps its name to a test file that exists and contains the
control's name,
Then the audit verdict is `deterrent`, the action is `keep — proven by <file>`, and it is not
listed under `decide`. Without such an entry the verdict stays `never-fired`.

### B2 — budget, arch and test_quality are proven deterrents

Given this repository,
When the audit runs,
Then `budget`, `arch` and `test_quality` read `deterrent`, each proven by a test that plants the
defect its `why:` names and asserts a failing verdict: one skill over the limit, a kernel module
importing from a layer above it, and a `test/` directory with no executable test.

### B3 — telemetry is not a control

Given rows whose control is `graph-refresh`,
When the audit runs,
Then they are not classified. `graph-refresh` has no defect to fire on; its rows exist so a failed
refresh is visible, and `staleSince` is where that is read.

### B4 — a retired name ages out

Given a control named by no stage, no hook, and no `[deterrents]` entry, whose most recent row is
older than seven days,
When the audit runs,
Then it is omitted from the table and listed on one trailing line as `retired: <names>`. That
covers `plan-drift` and `hook:pre-bash` today and any control deleted tomorrow.

### B5 — map-drift is a hook control that can pass

Given `map-drift` is recorded at Stop,
When the audit runs,
Then it is judged as a hook control, not unwired. And given a Stop where `CODEBASE-MAP.md` was
regenerated after the last change to the graph, When the hook records `map-drift`, Then the
verdict is `pass`. A unit test reproduces today's always-fail before the fix and passes after.

### B6 — this repository

Given this repository after the change,
When `harness ledger audit` runs,
Then `decide` is empty.

## Out of scope

- Deleting `budget`, `arch` or `test_quality`. Their `why:` lines stand and B2 proves them.
- Changing `KILL` thresholds.
- Any new sensor or check.

## Safeguards

- `the-ledger-cannot-judge-a-deterrent` B1 through B5 stay green: `never-fired` still exists for a
  control with no named proof, and `deletions` still holds only `unreliable`.
- A `[deterrents]` entry naming a file that does not exist, or a file that does not mention the
  control, is ignored with a warning line, never a `deterrent` verdict.
- B4's seven days is measured against the row's own timestamp, so a retired control that is
  wired back in reappears on its next row.
