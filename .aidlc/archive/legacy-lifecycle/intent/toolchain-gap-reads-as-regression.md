# Intent: toolchain-gap-reads-as-regression

- **Date:** 2026-08-24
- **Opened at:** 2026-08-24T21:52:19+01:00
- **Author:** cwijayasundara
- **Status:** draft <!-- draft | approved | closed -->
- **Source:** review/init-delivers-skills-and-agents.md, open finding 2 — observed on `examples/scratch-py`

## Problem

The baseline ratchet fails a build because of what is installed on the machine running it, in the
one case the rule against that was written to catch.

`.claude/lib/baseline.mjs` marks `check_stop_tokens` as `ENVIRONMENT_SENSITIVE` and skips it when
`errored_controls` differ between the captured baseline and the current run. The reasoning in the
file is right: *"a control that errors here but not there makes the stage output incomparable"*.

But a *missing plugin of an installed tool* does not produce an `errored` control. It produces a
`fail`. `examples/scratch-py` runs `python3 -m pytest -q --json-report --json-report-file={report}`;
where `pytest-json-report` is absent, pytest itself runs fine and exits non-zero with
`unrecognized arguments`. The control fails, `errored_controls` stays empty on both sides,
`envDiffers` is false, and the metric is graded. `check_stop_tokens` went 18 to 212 — measuring the
absence of a pip package, not a change to the code.

This is the third occurrence of the same class in this repository. `.claude/CLAUDE.md` already
records it: *"A metric that depends on which tools are installed grades the laptop, not the change.
Mark it `n/a` when the toolchain differs rather than failing the build."* The lesson was written
down and the implementation only covers the half of it that presents as an error.

The cost is not a red build. It is the temptation the red build creates: the obvious way to make it
green is `baseline capture`, which permanently bakes one laptop's missing packages into the ratchet
and disarms the control for everyone.

## Proposed outcome

A metric is graded when it is comparable and marked `n/a` when it is not, whether the toolchain
difference showed up as an error or as a failure.

- A control that fails for a reason unrelated to the change — a missing tool, a missing plugin of a
  present tool, an unusable flag — makes its dependent metrics `n/a`, not red.
- A control that fails because the code is wrong still fails, and still ratchets.
- The difference between those two is decided by evidence the harness already has, not by a
  hand-maintained list of error strings.
- Re-capturing a baseline is never the easiest way to make a red build green.
- The bundled example's cost job passes on a machine that has Node and nothing else, or reports
  `n/a` and says which tool was missing.

## Affected users and systems

- `.claude/lib/baseline.mjs` — `ENVIRONMENT_SENSITIVE`, `compare()`, and what `capture()` records.
- `.claude/lib/normalize.mjs` and `.claude/lib/runner.mjs`, which decide today whether a verb is
  `errored` or `failed`.
- `.github/workflows/harness.yml`, the cost job.
- `examples/scratch-py`, whose `test` verb requires a pytest plugin the repository never declares.

## Constraints

- Zero dependencies, and no package installation in the cost job — adding `pip install` would hide
  the defect rather than fix it, and would make the job depend on a network.
- The distinction must not become a list of tool-specific error strings to maintain. That is a
  second registry, and `harness.toml` is meant to be the only one.
- The ledger has to keep seeing these runs, or a control that is `n/a` forever becomes invisible to
  the deletion audit instead of being deleted.

## Open questions

1. What evidence separates "the tool could not do its job" from "the code is wrong"? A verb that
   produced no parseable findings but exited non-zero is a candidate signal, and
   `normalize.mjs` already distinguishes an empty suite from a failing one. Is that enough, or does
   the runner need to classify explicitly? **Author, with a recommendation at spec time.**
2. Should `capture()` record the resolved tool versions alongside the numbers, so `compare()` can
   see the toolchain changed rather than infer it from outcomes? More honest, and it makes the
   baseline file larger and noisier in diffs. **Author.**
3. Should `examples/scratch-py` simply stop depending on `pytest-json-report`, using the plain
   pytest exit code instead? That fixes today's symptom in one line and leaves the class of defect
   intact for every project that does something similar. **Author — worth answering "both".**
4. If every ratcheted metric ends up `n/a` on a bare machine, has the cost gate quietly stopped
   existing? There should probably be a floor below which `n/a` is itself a finding. **Author.**
