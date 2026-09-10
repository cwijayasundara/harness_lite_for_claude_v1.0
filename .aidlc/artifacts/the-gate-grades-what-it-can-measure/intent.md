---
status: draft
source: .aidlc/artifacts/the-index-tracks-the-source/review.md
source_revision: dd19f82e62beaafca951ecbb6bc309aa06ada08e
parent: lean-review-context-baseline
---
# Intent: the-gate-grades-what-it-can-measure

- **Date:** 2026-09-10
- **Author:** cwijayasundara
- **Source:** the independent review of `the-index-tracks-the-source`, filed at the bound
  `source_revision`. Every problem below is one of its findings.

## Problem

**The commit gate cannot pass on a dirty tree, which is the only tree it ever runs on.**

`.aidlc/checks/baseline.mjs` calls `capture()`, and `capture()` re-runs the whole `stop` stage
internally to measure `check_stop_tokens` — "what a green stage puts in front of the model on the
way to done". On an uncommitted runtime that stage fails, the rendered failure text replaces two
PASS lines, and the metric reads 1,888 against a recorded 12. Confirmed by running it:

```
baseline verdict on a DIRTY tree: fail
  baseline/check_stop_tokens = 1888, recorded 12 (+15633%, tolerance 1.1)
```

`harness check --stage commit` is what an agent runs *before* committing. Every run of it today
passed only because it happened to follow a commit, which is why the defect survived its own
change's verification. The existing escape hatch does not reach it: `ENVIRONMENT_SENSITIVE`
contains `check_stop_tokens`, but `compare()` applies the skip only when `errored_controls`
differ, and a control that **fails** is not a control that **errors**.

The metric is defined for a green stage and graded regardless of whether the stage was green.

**Three safeguards are booked as proven and are not.** The review found their proofs missing:

- The no-git degradation test cannot fail. `stage()` git-initialises and commits every fixture, so
  `headCommit()` always succeeds and the empty-component branch is never entered. The assertion
  was also true before the change, so it cannot have been written failing.
- The behaviour stated at `refresh()` — that it does not report `clean` across a commit — is
  proven one layer below it, at `fingerprint()`. `refresh` is never called.
- The `pack` miss path is booked in the plan as the safeguard that stops 451 removed modules from
  becoming confident "not found" answers, and nothing asserts it.

**A test carries an environment assumption the repository already knows about.** The new git
helper omits the `-c commit.gpgsign=false` that `evals/lib/stage.mjs` deliberately passes. Where
`commit.gpgsign` is set globally, the `--allow-empty` commit fails, no `spawnSync` status is
checked, and the assertion reports a production defect that is not there.

**And one latent defect that is about to stop being latent.** `build(cfg, { only })` bypasses
`discover()` and `walk()`, so the harness-output exclusion is not applied on that path. It has no
caller today. The incremental refresh work already discussed would give it one, and would silently
re-index the 451 modules the index change removed.

## Proposed outcome

A ratcheted metric is graded only when it is comparable, and every safeguard the index change
claimed has a test that can fail.

Observable from outside the system:

- `harness check --stage commit` passes on a dirty tree when the change is sound, and still fails
  when it is not.
- `check_stop_tokens` is reported rather than graded whenever the stage it measures was not green
  on both sides, and the reason says so.
- Each of the three unproven safeguards has an assertion that fails if the behaviour is removed.
- A test that needs a commit makes one the way the repository already knows to.
- The incremental build path applies the same exclusions as the full one.

## Affected users and systems

- `.aidlc/lib/baseline.mjs` — `capture()` records the stage outcome; `compare()` uses it.
- `.aidlc/lib/graph.mjs` — the `only` path applies the exclusions.
- `test/graph.test.mjs`, `test/unit.test.mjs` — the missing and unfailable proofs.
- Anyone running `harness check --stage commit`, which is currently red for reasons unrelated to
  their change.
- The incremental refresh change, which inherits the `only` defect if this does not land first.

## Constraints

- The tolerance stays at 1.10 and no recorded figure is edited to make a check pass. The repair is
  to grade the metric only when it means something, not to widen what counts as unchanged.
- `check_stop_tokens` stays in `RATCHETED`. A metric that is skipped when incomparable is still a
  metric; one that is deleted is not.
- The skip must not become a way to never grade it: on a green tree, which is what CI and a
  post-commit run see, it grades exactly as it does today.
- Fixtures under `evals/fixtures/` are write-protected, and a test is not weakened to pass — the
  three unproven safeguards get assertions that can fail, which is more proof than before, not
  less.
- Zero dependencies; `[limits]` unchanged; no new control, skill, hook or agent.

## Open questions

None blocking. One judgement recorded rather than asked: the review also notes that `refresh()`
computes `fingerprint()` twice per invocation, and that `HARNESS_OUTPUT` overlaps a list in
`test/install.test.mjs`. Both are real and neither is a defect in behaviour, so they are left for a
change that has a reason to touch those files rather than folded in here.
