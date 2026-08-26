# Plan: empty-suite-is-not-a-pass

- **Date:** 2026-08-24
- **Spec:** none — a single control with a single `why:`. The behaviour it adds is one
  sentence, and the plan's Proof row is the test that pins it.
- **Risk tier:** standard <!-- low | standard | critical -->
- **Status:** approved

## why:

**A test check that runs zero tests reports `PASS`.** A control that cannot fail is not a
control, and this one had been silently disarmed by a stale glob for the length of a whole
change.

Observed live during `supporting-artefacts-to-root`: `test/` moved to the repo root while
`[checks].test` still globbed `.claude/test/*.test.mjs`. `harness check --stage stop` printed

```
PASS  secrets     37ms
PASS  test        31ms      ← ran nothing
```

31ms against a real suite time of ~10s. Nothing anywhere said the suite had not run.

## Mechanism

Three things compose into the defect, and only the third is worth changing:

1. `runner.mjs:60` executes via `bash -c`. Bash passes an **unmatched glob through
   literally** rather than erroring (zsh, where this was first noticed by hand, errors — which
   is why it looked fine interactively and rotten under the harness).
2. `node --test <nonexistent path>` emits a well-formed empty TAP report and **exits 0**:
   ```
   TAP version 13
   1..0
   # tests 0
   ```
3. `runner.mjs:72` — `const verdict = (r.status === 0 && findings.length === 0) ? 'pass' : 'fail'`.
   Exit 0, no findings, therefore pass.

The seam is (3)'s second term. `normalize()` already owns "did this tool say no?", and the TAP
parser already reads the stream that carries the count. A zero-test report becomes a finding,
and the existing verdict line turns it into a `fail` with no change to `runner.mjs`.

## Why not the other candidates

| Candidate | Rejected because |
|---|---|
| Validate the glob in `check` before running | The harness would have to expand globs itself, in a shell it does not control, for every verb. It also only catches globs — not a typo'd binary, a `--filter` matching nothing, or a suite that silently skipped every case. |
| Assert a minimum test count in `harness.toml` | A number that must be maintained by hand rots the day someone deletes a test, and its failure mode is a false alarm — the most expensive kind for a control that fires rarely. |
| `set -o failglob` / `nullglob` in the runner | Fixes exactly one shell's behaviour for exactly one syntax, and silently changes how every existing project's command line is parsed. |
| A new hook binding | The budget is 5/5, and this needs no new binding: the control belongs in a sensor that already runs. |

## Budget

Unaffected. `checks/budget.mjs` counts skills (12), agents (3), hook bindings (5) and
`CLAUDE.md` lines. This adds none of those — it is a branch inside an existing normalizer.

## False positives

A legitimate empty run would be a false alarm, so it must not be reachable. It is not:
`runner.mjs:22` interpolates `{files}` to `'.'` when the changed-file list is empty, so
`--changed` with nothing changed still runs the whole suite rather than selecting nothing.
Zero TAP tests therefore always means a broken invocation, never an empty selection.

## Files

Every path this change touches. `harness check --stage commit` compares the diff against this
list — if they disagree, update this block in the same commit or revert the change.

```
.claude/lib/normalize.mjs
test/unit.test.mjs
```

## Order of work

1. Add the zero-test branch to `FORMATS.tap` in `normalize.mjs`, carrying rule
   `harness/empty-suite` and a `fix:` that names the `[checks]` command as the thing to look
   at. Detect on the TAP plan line (`1..0`) and on `# tests 0`, since a runner may emit either.
2. Pin it in `test/unit.test.mjs`, beside the existing
   `normalize: TAP failures carry file, line and reason` test. Three cases: a zero-test report
   produces exactly one finding; a report with real failures is unchanged; a healthy report
   with passing tests produces none.
3. Confirm against the live defect: with the stale glob still in place, `--stage stop` must go
   from `PASS test` to `FAIL test`.

## Proof

| Claim | Proof |
|---|---|
| A zero-test TAP report fails instead of passing | New test in `test/unit.test.mjs`: `normalize('tap', '1..0\n# tests 0\n', '', 0)` returns one finding, rule `harness/empty-suite` |
| A real failure still parses as before | Existing `normalize: TAP failures carry file, line and reason` continues to pass unmodified |
| A healthy suite is not flagged | New case: TAP with `ok 1` / `# tests 1` returns zero findings |
| The control fires on the defect that motivated it | Run `--stage stop` while `[checks].test` is still stale: `FAIL test`, not `PASS test` in 31ms |
| Nothing else regressed | `harness check --stage stop` — full suite, and the count must read 110, not 107 |

## Risks

| Risk | Mitigation |
|---|---|
| A project legitimately runs a suite with zero tests | Not reachable via `--changed` (see False positives). A genuinely empty new project has no `test` command yet, and `runner.mjs:49` already returns `skipped` for an absent command — a different and correct verdict |
| The `# tests 0` regex also matches `# tests 0` inside a nested subtest indent | Anchored to the report-level line; the healthy-suite test case would catch over-matching |
| Only TAP is covered — pytest and others can still pass vacuously | True, and deliberately out of scope: this plan fixes the format where the defect was observed. Widening to `pytest` needs its own `why:` and its own evidence, not a speculative generalisation |
