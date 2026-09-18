# Preparation evidence — 8 September 2026

Baseline: `4add89e3741e6a652731c488e68140c78900dc0b`, clean working tree on entry.

`node .aidlc/artifacts/decomposition-allocation/reproduce.mjs` exited 0 and asserted
that an independent reporting spec in a disposable product copy was refused solely
for its missing continuity link to the existing title-casing change. See reproduction.json.
The approval attempt was simulated. Protected fixture sources were not edited.

`node .aidlc/bin/harness check --stage stop` exited 0:

```
PASS  secrets     58ms
PASS  test        29546ms
```

`git diff --check` passed. These checks validate preparation against the existing
runtime; they do not demonstrate item 4 acceptance. Only new draft artifacts and
the evolution plan preparation record were written. No production implementation,
approval, hosted review, remote write, merge or deployment is claimed.

Pending: genuine spec and plan decisions; then implementation, migration regressions,
three-child product evidence, full commit/candidate checks and implementation review.

# Implementation evidence

The user replied “approved and continue” to the concrete spec and plan. Preparation was
committed as `6145407`; the existing approval CLI recorded that conversation decision as
`cwijayasundara` in `121193e`. This is an agent-recorded audit label, not an authenticated
host review or a claim that the human ran the CLI. The worktree selects this change.
Approved spec/plan bodies and historical artifacts were preserved.

Before changing production semantics, the updated independent-approval regression failed
with the saved “says nothing about the open change” refusal (1 failed test). Afterward,
`node --test test/supersedes.test.mjs` passed all 15 tests, retaining explicit target,
exact-citation and historical supersession protections. `node --test test/coordination.test.mjs`
passed all 8 tests using disposable product copies and real Git histories. Initial fixture
setup incorrectly omitted create's template path; corrected the helper, not fixture sources.

`node .aidlc/artifacts/decomposition-allocation/product-trial.mjs` passed. post-fix.json
archives three approved child outcomes, unmapped integration criterion, independent
approval, overlap, missing prerequisite, cycle, changed interface, tracker projections,
stale local metadata and unchanged unrelated worktree authority. All product approvals
are explicitly simulated. This demonstrates coordination, not completed child features.

Standalone stop stage:

```
PASS  secrets     188ms
PASS  test        29944ms
```

Local commit stage:

```
PASS  secrets     67ms
PASS  test        30113ms
PASS  scope-drift 186ms
PASS  budget      1ms
PASS  tamper      185ms
PASS  arch        26ms
PASS  test_quality 28ms
```

`git diff --check` passed. The current-change reader reports both gates approved and
only this plan's Files scope. Full-suite results include existing requirement binding,
worktree selection and candidate-boundary regressions. No budget, control, hook, agent,
runtime dependency or protected fixture was added/changed.

Clean candidate verification:

```
node .aidlc/bin/harness check --stage commit --base 4add89e3741e6a652731c488e68140c78900dc0b --candidate HEAD --change decomposition-allocation
candidate 1d718d72395252f6fd776371d81f604deee3a87d from 4add89e3741e6a652731c488e68140c78900dc0b — change decomposition-allocation
PASS  secrets     157ms
PASS  test        30127ms
PASS  scope-drift 158ms
PASS  budget      1ms
PASS  tamper      301ms
PASS  arch        26ms
PASS  test_quality 27ms
```

The exact report is archived in candidate-report.json. It records the checked implementation
commit, not the later evidence-only archive commit. Final inspection confirms no changes to
protected fixture sources or .aidlc/harness.toml. Items 5–6 were not started.
