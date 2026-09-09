---
status: draft
---
# Plan: a-baseline-measures-what-ships

## Approach

One extraction, one adapter, one stage entry, one recapture.

The payload assembly currently living inside `dispatch.mjs`'s `session-start` case moves to
`sessionContext(cfg)` in a new `.aidlc/lib/session.mjs`. `dispatch.mjs` calls it and writes the
result; `baseline.mjs`'s `capture()` calls the same function and estimates its tokens. The
synthetic four-line block at `baseline.mjs:30-35` is deleted, not corrected — that is the whole
of B1 and B2. `invocation(cfg)`, which the payload interpolates, moves with it, since the two
have no meaning apart.

`session.mjs` is a new module rather than a home in an existing one because the payload reads
from `checks/budget.mjs`, `lib/ledger.mjs`, `lib/refresh.mjs`, `lib/graph.mjs`, `lib/map.mjs`,
`lib/guard.mjs` and `lib/artifacts.mjs`. Any existing module that adopted it would gain six
imports it has no other reason to hold. `hook_loc` falls as a side effect, which is a saving and
not the point.

The gate is `.aidlc/checks/baseline.mjs`, a thin adapter registered in `runner.mjs`'s check map
and named in `[stages] commit`. It loads the recorded baseline, captures the current one, calls
the existing `compare()`, and returns regressed rows as findings. No new measurement is written:
`compare()` and `RATCHETED` are unchanged except for B4's schema assertion.

B5 is recorded in the delivery section of `docs/IMPROVEMENT-PLAN.md`, not as a new field in
`baseline.json`. Adding a note field would itself be a key `capture()` produces for no
measurement, and B4 exists to make exactly that visible.

## Files

- `.aidlc/lib/session.mjs`
- `.aidlc/hooks/dispatch.mjs`
- `.aidlc/lib/baseline.mjs`
- `.aidlc/checks/baseline.mjs`
- `.aidlc/lib/runner.mjs`
- `.aidlc/harness.toml`
- `.aidlc/baseline.json`
- `test/unit.test.mjs`
- `docs/IMPROVEMENT-PLAN.md`

## Order

1. Add `.aidlc/lib/session.mjs` exporting `sessionContext(cfg)` and `invocation(cfg)`, moved
   verbatim from `.aidlc/hooks/dispatch.mjs` so the emitted string is byte-identical to today's.
2. Rewrite the `session-start` case in `.aidlc/hooks/dispatch.mjs` to call `sessionContext(cfg)`
   and write its result, deleting the inline assembly. `ledger.newRun` stays in the hook — it
   rotates the run id and is not part of the payload.
3. Add a failing test in `test/unit.test.mjs` asserting that the string `dispatch.mjs` emits for
   `session-start` is identical to `sessionContext(cfg)` for the same repository state, and that
   `dispatch.mjs` contains no second assembly of it. This is B2's proof and it must fail before
   step 4 exists.
4. Delete the synthetic block at `.aidlc/lib/baseline.mjs:30-35` and have `capture()` call
   `sessionContext(cfg)`. B1.
5. Add the schema assertion to `compare()` in `.aidlc/lib/baseline.mjs`: a key present in the
   recorded file that `capture()` does not produce is returned as a reported row, never dropped.
   B4.
6. Add `.aidlc/checks/baseline.mjs` exporting `run(cfg)` in the shape `secrets`, `scope-drift`,
   `budget` and `tamper` use, returning `compare()`'s regressed rows as findings that name the
   metric, the recorded figure and the current figure.
7. Register `baseline` in `.aidlc/lib/runner.mjs`'s check map and append it to `[stages] commit`
   in `.aidlc/harness.toml`. B3.
8. Extend the existing baseline tests in `test/unit.test.mjs` to cover B3 (a rise beyond tolerance
   fails the stage and names both figures; a rise within it passes) and B4 (`wiki_index_tokens`
   in a recorded file is reported, not ignored).
9. Run `harness baseline capture` to regenerate `.aidlc/baseline.json` against the repaired
   measurement, removing `wiki_index_tokens` and moving `session_context_tokens` from 52 to its
   real value.
10. Record the correction in `docs/IMPROVEMENT-PLAN.md`: the figure moved because the measurement
    was repaired and the payload did not change, naming the commit at which step 4 landed. B5.
11. `harness check --stage commit`, and paste the output.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/unit.test.mjs` — `capture()` on a fixture repository returns `session_context_tokens` equal to `estimateTokens(sessionContext(cfg))`, and the value is not the four-line figure. Plus step 9's regenerated `.aidlc/baseline.json` as runtime evidence. |
| B2 | `test/unit.test.mjs` — the `session-start` hook's emitted `additionalContext` is byte-identical to `sessionContext(cfg)`, and `dispatch.mjs` holds no second assembly. Written failing at step 3. |
| B3 | `test/unit.test.mjs` — `check(cfg, { stage: 'commit' })` on a fixture whose recorded baseline is below tolerance reports `PASS` for `baseline`; on one above tolerance it reports `fail` with a finding naming the metric and both figures. |
| B4 | `test/unit.test.mjs` — a recorded baseline carrying `wiki_index_tokens` produces a reported row rather than being silently ignored, and a file with only current keys does not. |
| B5 | The delivery paragraph added to `docs/IMPROVEMENT-PLAN.md` at step 10, naming the commit, alongside the regenerated `.aidlc/baseline.json` whose `captured_at` is the capture date. Prose evidence, not an executed test. |

`test/unit.test.mjs` is `node:test`, so these are file-and-test-name rows rather than pytest
node ids; the repository has no pytest execution to match them against. Passing execution still
requires a reviewer to judge whether each row proves its behaviour, and B5's row is a document,
which no test can grade.

## Dependencies

None. This change has no `depends_on`.

`docs/IMPROVEMENT-PLAN.md` is also named in the in-flight `graph-first-versus-grep-first` plan's
`## Files`, so `harness status` reports an overlap on it. The overlap is real and was accepted by
the user on 2026-09-09. Serialization is the agreed handling: this change appends a delivery
paragraph and edits none of the rows that change owns, and the review section it sources from was
appended the same way at `b5c4c2f`.

`.aidlc/lib/runner.mjs` and `.aidlc/lib/baseline.mjs` are not named in any other approved plan's
`## Files`, so steps 4 to 7 carry no cross-change invariant. `code-property-graph` reads
`baseline.mjs`'s pack sampling but does not edit it, and its spec's B5 holds that surface
unchanged.
