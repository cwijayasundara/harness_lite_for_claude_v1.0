# Item 6 preparation evidence

Inspected clean baseline `34835f0c75b43908af3ffccc551fae40e5edbd4f` on 8 September 2026.
Only new draft artifacts and the evolution-plan preparation record were written.

`node .aidlc/artifacts/team-reuse/reproduce.mjs` passed its pre-fix assertions:
the disposable consumer recorded the baseline commit, executed a different runtime Git
commit, and doctor returned zero with no mismatch/unverified diagnostic. Full observations
are in reproduction.json. No product fixture source or approval was changed.

`node .aidlc/bin/harness check --stage stop` exited zero:

```text
PASS  secrets     119ms
PASS  test        69173ms
```

`git diff --check` passed. These checks establish preparation compatibility, not item 6
implementation acceptance. Commit/candidate checks, post-fix product reuse and implementation
review remain pending concrete spec/plan approval. No hosted run, physical-machine trial,
authenticated review, paid campaign, remote write, merge or deployment is claimed.

## Implementation and approval

The user replied “approved, lets proceed”. Preparation was committed as 981a0c3; the existing
CLI recorded spec/plan approval in 3912013 under cwijayasundara. This records the conversation
decision, not authenticated host review or a human CLI invocation. The worktree explicitly
selects team-reuse. Production implementation is confined to item 6's approved plan scope.

Changes extend installer/shim, doctor, runner, ledger/export and the consumer CI recipe. Runtime
content includes modes and exact commit checks; policy has separate byte identity. Evidence
carries a unique invocation, actor provenance and runtime/policy/repository observations.
There is no added registered control, dependency, hook, agent, skill or budget increase.

## Product and regression evidence

`HARNESS_TRACE_PYTHON=/private/tmp/item1-python/bin/python node
.aidlc/artifacts/team-reuse/post-fix.mjs` runs the existing disposable staging boundary.
It provisions two local isolated installations, executes two separately approved simulated
product slices, and preserves real failing/passing pytest observations and exact invocation
exports. The output is post-fix.json; no fixture sources changed. These are local environments,
not two physical machines or hosted CI. The reused procedure is sourced from item 5's
post-fix.mjs and documented with applicability/limits in the existing review policy.

The default Python had pytest but lacked pytest-json-report; that first product run did not
establish executed proof. The successful trial uses the already existing item1-python
environment, with no new dependency installation. A trial accidentally started while the
runtime was being committed was refused as mismatched and was rerun against clean code.

The first focused suite exposed a changed diagnostic assertion and truncated CLI JSON. The
first full stop exposed two budget tests relying on legacy shim execution. These were repaired
without weakening scope, budget or executed-proof assertions. The updated full stop passed:

```text
PASS  secrets     82ms
PASS  test        69571ms
```

Final identity/export regressions after diagnostic/schema hardening: 13 tests passed, no skips.
Earlier installation/export suite: 19 passed. Identity/budget/product-staging suite: 22 passed,
11 opt-in product tests skipped. Full final-stage results follow below.

Final standalone stop at implementation a900767:

```text
PASS  secrets     67ms
PASS  test        70748ms
```

The final product trial was rerun against that same clean runtime revision and passed both
failing-before/passing-after slices with executed pytest proof. post-fix.json preserves the
full reports/exports and labels all approval/actor decisions as simulations.

Local commit-stage check passed at a900767 while writing only the delivery evidence/docs:

```text
PASS  secrets     62ms
PASS  test        68620ms
PASS  scope-drift 201ms
PASS  budget      0ms
PASS  tamper      155ms
PASS  arch        27ms
PASS  test_quality 31ms
```

local-report.json preserves the report with explicit actor label codex-item6-implementation,
worktree change team-reuse and observed dirty documentation state. It is local verification;
the separate exact-candidate report follows the evidence commit. `git diff --check` passed.
