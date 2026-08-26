# Intent: eval-grader-cannot-find-harness

- **Date:** 2026-08-25
- **Opened at:** 2026-08-25T05:51:58.097Z
- **Author:** cwijayasundara
- **Status:** draft <!-- draft | approved | closed -->
- **Source:** conversation, 2026-08-25 — smoke run of `surgical-fix`, `honest-failure`, `test-integrity` at `--repeats 1`

## Problem

Two of those three tasks were reported `FAIL`. Both models had in fact done the work correctly —
each fixed `divide()` in the fixture, left `add.py` and `tests/test_calc.py` untouched, and
pasted a green `--stage stop`. What failed was the grader:

```
fixture_tests_pass: Error: Cannot find module '<repo>/bin/harness'
```

`evals/run.mjs:17` keeps its own `CLAUDE_ROOT = path.dirname(HERE)`. That resolved to `.claude/`
while `evals/` lived inside the plugin root; since `8c714d5` moved it out, it resolves to the
repo root. So `run.mjs:241` executes `<repo>/bin/harness`, which does not exist, and `run.mjs:242`
hands `--plugin-dir` the repo root, which holds a marketplace manifest rather than a plugin one.

Eight of the twenty-one golden tasks assert through that binary — `surgical-fix`,
`test-integrity`, `red-first`, `plan-alignment`, `plan-drift-honesty`, `pure-refactor`,
`no-secret-commit`, `second-req-links-first`. Since the move, the suite that authorises deletion
has been unable to grade 38% of its own floor, and has been reporting its breakage as model
failure. Nothing catches it: `--dry` never spawns the binary, and the unit suite passes because
`runSuite` takes `harnessBin` as a parameter and every test supplies a correct one from
`test/_paths.mjs`. `main()` is the only caller that computes the path, and the only one no test
covers. This is the Phase 0 exit-127 defect in a new place — a dead sensor read as a verdict.

## Proposed outcome

- A suite run on a correctly installed checkout grades every task through the real
  `.claude/bin/harness`; the eight tasks above pass or fail on the model's work alone.
- A missing or unrunnable harness binary aborts the run as fatal — the way an unauthenticated
  CLI already does — naming the path it tried. No task is ever marked `FAIL` because the grader
  could not execute.
- That abort happens before the suite has paid for a full run to discover it.

## Affected users and systems

- `evals/run.mjs` `main()` — the only place holding a second definition of the harness root.
- The eight tasks listed above, and any future task asserting `fixture_tests_pass` or
  `harness_stage_passes`.
- The CI evals job (`.github/workflows/harness.yml:58`), which does trigger on `evals/run.mjs`.
- Every results file written under `.claude/evals/results/` since `8c714d5`: those verdicts
  overstate model failure, and anything reading them for indicators inherits the error.

## Constraints

- Zero dependencies; the suite must still run on a cold clone.
- `evals/lib/stage.mjs:23` was already repaired for the move and must keep working. Whatever
  fixes `main()` must not create a third notion of where the harness root is.
- Fixtures stay write-protected.
- No control-budget change: this adds no skill, agent, or hook.

## Open questions

1. Is the plugin genuinely failing to load, or only the binary path? The transcripts show no
   plugin warning and the CLI offers no way to probe `--plugin-dir` without spending. Answered
   by the repo owner, or by one cheap single-task probe once the binary path is fixed.
2. Did the evals job ever actually run on the move PR, or did it no-op for want of a key? This
   overlaps the open `ci-runs-without-a-key` spec, and decides whether CI is a real backstop
   here or a second thing to fix. Answered by the repo owner.
3. Should the results files written since the move be marked invalid, or left as history with a
   note? Answered by the repo owner.
4. Does the fatal abort belong only in `run.mjs`, or should `runStage` in `assertions.mjs` also
   distinguish "binary missing" from "check failed" for any caller that passes a bad path?
   Answered in the spec.
