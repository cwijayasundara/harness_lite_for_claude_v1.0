# Evidence: every-control-fires-or-goes

## B1–B5, 2026-09-06

`node --test test/*.test.mjs`: 222 pass, 0 fail. `harness check --stage commit`: secrets, test,
scope-drift, budget, tamper, arch, test_quality all PASS.

- B1 `test/unit.test.mjs` — a proven never-fired control reads `deterrent`; a proof file that is
  missing or never names the control leaves `never-fired` and a warning.
- B2 `test/budget.test.mjs` (an eighth skill), `test/arch.test.mjs` (a lower layer importing a
  higher one; a provider import), `test/unit.test.mjs` (a test directory that executes nothing):
  each planted defect is a failing verdict. All three fired on the first run — the controls were
  deterrents, not corpses, and now the audit can say so.
- B3 `graph-refresh` rows are not classified.
- B4 stale unreachable names are `retired`; a fresh row keeps `unwired`.
- B5 `test/map-drift.test.mjs`: `pass` after a fresh map, `fail` after a structural edit, and
  the Stop that found the drift wrote the map, so the next Stop passes. Root cause: CODEBASE-MAP.md
  was last written 2026-09-03; the Stop hook only ever *told* the agent to run `harness map`,
  and 91 of 91 Stops recorded `stale-map`. The F6 shape — an instruction nobody follows — for
  the third time. The hook now writes the map, and scope-drift treats it as harness output.

Also fixed on the way: the architecture sensor's layer table still named `contract` (deleted by
lean-v2) and named neither `artifacts` nor `map`, so neither module was checked. Both are in the
table now and the real kernel passes.

## B6 — the audit on this repository, 2026-09-06

```
ledger audit · 6383 rows · 431 runs · last 30d
thresholds: fires on >=5% of invocations, errors on <10%, after 50 invocations

  bash-guard       3107 inv   15.7% fired  keep
      init-force             120 fired
      contract-scope           4 fired  1 called false
      destructive              1 fired
  secrets          1560 inv    0.6% fired  review — does it catch anything the eval suite would miss?
  write-guard      605 inv    1.8% fired  review — does it catch anything the eval suite would miss?
  test             460 inv   13.5% fired  keep
  budget           167 inv    0.0% fired  keep — proven by test/budget.test.mjs
  scope-drift      147 inv    7.5% fired  keep
  map-drift         92 inv  100.0% fired  keep
      stale-map               92 fired
  arch              80 inv    0.0% fired  keep — proven by test/arch.test.mjs
  test_quality      80 inv    0.0% fired  keep — proven by test/unit.test.mjs
  tamper            64 inv    1.6% fired  review — does it catch anything the eval suite would miss?
  hook:pre-bash      1 inv    0.0% fired  decide — no stage runs it, so the ledger cannot judge it: wire it into a stage or remove it

Nothing the ledger can justify deleting on its own evidence.
Decide:  hook:pre-bash — read each why: before acting
Retired: plan-drift — nothing reaches these and nothing has recorded them for a week
```

`budget`, `arch` and `test_quality` read `keep — proven by`. `map-drift` reads keep; its fire
rate will fall from 100% now that the map is regenerated. `plan-drift` is retired.

**One `decide` row remains: `hook:pre-bash`.** It is a single `errored` row from 2026-09-03
(`commandText is not defined`, a dispatcher crash fixed the same day). Under B4 it retires on
2026-09-10, seven days after its only row, without anyone touching anything. B6 holds from that
date; it is recorded here rather than met by shortening the window.

## Closed

Closed 2026-09-06. Three plan amendments during implementation (`config.mjs`,
`sensors/architecture.mjs`, `checks/scope-drift.mjs`), each refused by the guard until the owner
re-approved — the cost `a-diff-belongs-to-one-change` predicted, paid three times in one change.
The lesson for plans: name the loader, the sensor table and the check that will see the diff, not
only the module being changed.
