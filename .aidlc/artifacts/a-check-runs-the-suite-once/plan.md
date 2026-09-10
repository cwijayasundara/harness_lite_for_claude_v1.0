---
status: approved
spec_digest: sha256:94a1f63049d52f7892906a15781401172b9fc9c06ddaa7839f2051fc4e34f7f4
spec_approval_digest: sha256:440878c5fefa8c170520e90b148554e185c3d577cb8cdbf72d149eeaec69fcf4
by: cwijayasundara
at: 2026-09-10T18:12:59.840Z
digest: sha256:dd6150bb6d4bf20ef5b9904d47922ea823d1a4d6b6b79e6693d2808fb93516d9
approval_version: 2
approval_digest: sha256:fb5774706d290916a81c8a2c1dbc590a1818bec65651214cd5f0bb6d6b0235c0
---
# Plan: a-check-runs-the-suite-once

## Approach

`check()` already holds every result it has gathered, in a local `results` array
(`.aidlc/lib/runner.mjs:121`). The change is to let a control see them: `runOne` calls
`mod.run(cfg, files)`, and a third argument carrying the in-flight results is enough. Controls
that do not want it ignore it, and an unused third parameter costs an existing control nothing.

**The report is rebuilt by the same code that builds it live, not by a second implementation.**
`check()` assembles its report object inline at `.aidlc/lib/runner.mjs:158-181` — the `ok`
computation, the `controls` mapping, the `max_findings` cap and the `truncated` count. That block
is extracted into one function and called from both places. This is the same lesson D1 just paid
for: two implementations of one question disagree, and the disagreement is invisible until
something depends on it. Here what depends on it is a 12-token metric with a 1.2-token budget.

**Stop-shape, not commit-shape.** The in-flight results of a commit run are a superset of `stop`:
they also hold `scope-drift`, `budget`, `tamper`, `arch` and `test_quality`, and a run invoked with
`--base`/`--candidate` carries a `revision` line that `render()` emits at
`.aidlc/lib/runner.mjs:206`. The baseline control therefore filters the accumulated results to the
verbs `resolveStage(cfg, 'stop')` names, in that order, and builds a report with `stage: 'stop'`
and no `revision`. Handing `capture()` the commit report instead would change `check_stop_tokens`
outright, which is the whole risk this change carries.

`capture()` takes an optional precomputed stop report and keeps its own `check()` call for the
standalone `harness baseline capture` and `harness baseline check` verbs, which have nothing to
borrow from.

The alternative considered and rejected: have `capture()` reach for `.aidlc/state/last-check.json`.
It needs no plumbing and it is wrong — that file is written by a *previous* run, so the metric
would grade a report from a different tree, and it is not written at all when `write: false`.

**B1's fixture is a temporary repository built by the test, not a file under `evals/fixtures/`.**
A `harness.toml` whose `test` command appends a line to a counter file proves the invocation count
directly. Nothing under the protected fixture tree is added or edited.

## Files

- `.aidlc/lib/runner.mjs`
- `.aidlc/lib/baseline.mjs`
- `.aidlc/checks/baseline.mjs`
- `test/unit.test.mjs`
- `CODEBASE-MAP.md`

## Order

1. `test/unit.test.mjs` — the failing test first. A temporary repository whose configured `test`
   command appends to a counter file; run `harness check --stage commit` once; assert the counter
   reads exactly one. It must read two before anything else is touched, and that output is pasted
   into `review.md` as the reproduction.

2. `.aidlc/lib/runner.mjs` — extract the report assembly at lines 158-181 into one function and
   call it from `check()`. No behavioural change; the existing suite proves it, and the rendered
   output of a green stop stage must be unchanged except for `ms`.

3. `.aidlc/lib/runner.mjs` — pass the accumulated `results` to `mod.run(cfg, files, results)`.

4. `.aidlc/checks/baseline.mjs` — accept the third argument, filter it to the `resolveStage(cfg,
   'stop')` verbs in stage order, build a stop-shaped report with the extracted function, and pass
   it to `capture()`. When the argument is absent or does not contain every stop verb, pass
   nothing and let `capture()` run its own stage — a partial set is not a measurement.

5. `.aidlc/lib/baseline.mjs` — `capture(cfg, { stopReport } = {})` uses the given report and
   otherwise calls `check()` exactly as today.

6. `test/unit.test.mjs` — the remaining behaviours. B2: the reconstructed report equals a freshly
   computed one once `ms` is normalised out. B6: a commit run reconstructs only the stop verbs and
   carries no `revision` line, asserted for a `--base`/`--candidate` invocation too. B3: the
   standalone verb still runs its own stop stage with no run in flight. B4: a failing suite fails
   the commit stage and `baseline` is never reached.

7. `CODEBASE-MAP.md` — regenerate with `harness map`.

8. `--stage commit` before and after, on the same tree, both pasted. `check_stop_tokens` compared
   against the recorded `.aidlc/baseline.json`, which is not written by this change.

Steps 1-5 are the repair; 6 completes the behaviours; 7-8 close it.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | new `test/unit.test.mjs::one commit-stage run invokes the test command exactly once` — a temporary repository whose `test` command increments a counter; asserted failing at step 1, reading two, before it is made to read one |
| B2 | new `test/unit.test.mjs::the reconstructed stop report matches a freshly computed one` — deep equality with `ms` normalised on every control, the only field permitted to differ |
| B3 | new case: `capture()` with no precomputed report runs its own stop stage, asserted by the counter incrementing when the standalone verb is invoked |
| B4 | new case: a repository whose suite fails; `--stage commit` fails and the report shows `baseline` as `skipped`, never `pass` |
| B5 | `harness check --stage commit` on this repository, before and after, with `check_stop_tokens` graded against the unmodified `.aidlc/baseline.json` and the `baseline` control reported PASS |
| B6 | new case: a commit run reconstructs exactly `resolveStage(cfg, 'stop')` in order and carries no `revision` key, asserted for both an ordinary and a `--base`/`--candidate` invocation |

Runtime proof beyond the suite: elapsed `--stage commit` on this repository before and after the
change, on the same tree and with no other load, both pasted. The measurement taken while writing
this plan — `harness baseline check` alone at 1:13.23 — is the size of the duplicated work and is
what the after-figure should shed. No model call anywhere in this change.
