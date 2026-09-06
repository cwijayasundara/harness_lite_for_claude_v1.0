---
status: draft
---
# Plan: every-control-fires-or-goes

## Approach

Three small edits to the audit and one repair.

The audit already has a verdict table in `report()` and an action table in `audit()`. B1 adds
one verdict, `deterrent`, chosen before `never-fired` when `cfg.deterrents?.[control]` names a
file that exists and contains the control name. B3 adds a skip list of one name. B4 filters by the
row's own timestamp against the wired set the audit already computes. None of it changes the
thresholds.

`map-drift` at 100% is the one real repair. `dispatch.mjs:237` records `stale-map` whenever
`d.drifted`, and 86 of 86 Stops drifted, which means the map is compared against something that
moves on every Stop, or is never rewritten. The test reproduces it first: build a fixture repo,
run `harness map`, run the Stop action, assert the recorded verdict is `pass`. Only then read
`map.mjs` for the cause. The fix stays inside `map.mjs` or `dispatch.mjs`.

Rejected: recording proof in plan `Proof` rows and having the audit read plans. The audit is a
ledger question; plans are a change question; and `harness.toml` is the one registry that already
names controls.

Rejected: deleting `graph-refresh` rows from the ledger. The ledger is append-only and a refresh
that errors must stay visible.

## Files

- `.aidlc/lib/ledger.mjs`
- `.aidlc/lib/map.mjs`
- `.aidlc/hooks/dispatch.mjs`
- `.aidlc/harness.toml`
- `.aidlc/templates/harness.toml`
- `.aidlc/bin/harness`
- `test/unit.test.mjs`
- `test/budget.test.mjs`
- `test/arch.test.mjs`
- `test/map-drift.test.mjs`
- `docs/OPERATING.md`
- `.aidlc/artifacts/every-control-fires-or-goes/`

## Order

1. `test/unit.test.mjs` — B1: a never-fired control with a `deterrents` entry naming an existing
   file that contains its name reads `deterrent`; naming a missing file reads `never-fired` with a
   warning; the existing audit tests pass unchanged. Red.
2. `.aidlc/lib/ledger.mjs` — the verdict and the action. Green.
3. `test/budget.test.mjs` — B2: eight skill directories against a limit of seven is a failing
   verdict naming `skills`. `test/arch.test.mjs` — a temp kernel where a `lib/` module imports
   from `bin/` is a failing verdict. `test/unit.test.mjs` — `test-quality.mjs` against a `test/`
   directory with no `test(` call exits non-zero. Each red first where the case is missing.
4. `.aidlc/harness.toml` and `.aidlc/templates/harness.toml` — `[deterrents]` with the three
   entries.
5. `test/unit.test.mjs` — B3: `graph-refresh` rows are absent from `report().controls`. B4: a
   control with only eight-day-old rows and no wiring is in `retired`, not `controls`; the same
   control with a row today is `unwired`. Red, then `.aidlc/lib/ledger.mjs` green, and
   `.aidlc/bin/harness` prints the `retired:` line.
6. `test/map-drift.test.mjs` — B5: fixture repo, `harness map`, Stop action, recorded verdict is
   `pass`; then edit a module, Stop, recorded verdict is `fail`. Red on the first case today.
7. `.aidlc/lib/map.mjs` or `.aidlc/hooks/dispatch.mjs` — the cause, once the test names it.
   `.aidlc/lib/ledger.mjs` — `map-drift` joins `HOOK_CONTROLS`.
8. `docs/OPERATING.md` — the `[deterrents]` table, two sentences.
9. `.aidlc/bin/harness ledger audit` — B6: paste the output into
   `.aidlc/artifacts/every-control-fires-or-goes/evidence.md`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/unit.test.mjs` — a proven never-fired control reads `deterrent`; an unproven one reads `never-fired` |
| B2 | `test/budget.test.mjs`, `test/arch.test.mjs`, `test/unit.test.mjs` — each planted defect yields a failing verdict |
| B3 | `test/unit.test.mjs` — `graph-refresh` rows are not classified |
| B4 | `test/unit.test.mjs` — an unwired control with stale rows is `retired`, with a fresh row `unwired` |
| B5 | `test/map-drift.test.mjs` — `pass` after a fresh map, `fail` after an edit |
| B6 | `.aidlc/artifacts/every-control-fires-or-goes/evidence.md` — the audit output with an empty `decide` |
