---
status: approved
extends: the-index-tracks-the-source
source_digest: sha256:2c7edd535c8a5de16e712feebff488d419341ea63a4927ee89cfd84560227a22
source: .aidlc/artifacts/the-index-tracks-the-source/review.md
source_revision: dd19f82e62beaafca951ecbb6bc309aa06ada08e
source_kind: repository
intent_digest: sha256:4384d86aa838d8da0e032f0cb0488dafb5eca2aae2d31fdfcebf1a8ed7861dc2
intent_input_digest: sha256:7161a6e28740fe1a7778c72b557698e178dd6c28166360331989854a566ebfc3
intent_revision: c166d00f2ce157dc234abc97cc4150dfde34f257
by: cwijayasundara
at: 2026-09-10T05:42:26.770Z
digest: sha256:9763dda2cf58bc28fd3ddbb393c689afd9a925fc737c05fd597c0578da15758c
approval_version: 2
approval_digest: sha256:322dc25e7bcdabb6e63488a016420659b23d0bc7ded9cd35af1a777fe7f3b098
---
# Spec: the-gate-grades-what-it-can-measure

## Outcome

A ratcheted metric is graded only when it is comparable, and every safeguard the index change
claimed has a test that can fail.

## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| review:the-gate-cannot-pass-on-a-dirty-tree | B1 |
| review:safeguards-booked-as-proven-are-not | B2, B3, B4 |
| review:a-test-carries-an-environment-assumption | B5 |
| review:the-incremental-path-skips-the-exclusions | B6 |

## Observable behaviours

### B1

Given a working tree with uncommitted changes, which is the only tree `harness check --stage commit`
is ever run on,
When the `baseline` control runs,
Then `check_stop_tokens` is reported rather than graded, and the reported reason names the stage
outcome that made it incomparable. `capture()` records whether the `stop` stage it ran was green,
and `compare()` skips the metric whenever that outcome differs between the recorded baseline and
the current capture, or is not green now — because the metric is defined as what a *green* stage
puts in front of the model.

On a green tree the metric grades exactly as it does today: a rise beyond the recorded 1.10
tolerance still fails, with the same finding, and the tolerance is unchanged. A baseline recorded
before this change, carrying no stage outcome, is treated as comparable rather than as a skip, so
no existing record silently stops being graded.

The metric stays in `RATCHETED`.

### B2

Given a directory that is genuinely not a git repository,
When `fingerprint()` runs against it,
Then it returns a value rather than throwing, and that value is the one an empty commit component
produces. The test that proves this does not use `stage()`, which git-initialises and commits
every fixture it creates, so the assertion fails if the empty-component branch is removed. The
same holds for a repository with no commit.

### B3

Given a commit that changes no file in the working tree,
When `refresh()` runs across it,
Then it does not return `{ skipped: 'clean' }`, asserted by calling `refresh()` — the boundary the
approved behaviour is stated at — rather than by comparing two `fingerprint()` values one layer
below it.

### B4

Given a symbol defined in a path the index no longer covers,
When a caller asks `pack` for it,
Then the answer is a miss that names search as the next step, not a report of absence. This is the
safeguard that stops 451 removed modules from becoming confident "not found" answers, and it is
asserted rather than assumed.

### B5

Given a machine with `commit.gpgsign` set globally,
When a test needs a commit,
Then it makes one the way `evals/lib/stage.mjs` already does — passing `-c commit.gpgsign=false`
— and a git invocation that fails is reported as a failed git invocation rather than surfacing
later as an assertion about production code.

### B6

Given `build(cfg, { only, previous })`,
When it rebuilds a subset of modules,
Then paths under the harness's own output roots are excluded exactly as they are on the full path,
so an incremental rebuild cannot reintroduce the 451 modules the index change removed. This has no
caller today; the behaviour is fixed before the incremental refresh work gives it one.

## Design

B1 adds one field. `capture()` already runs the `stop` stage and already keeps
`errored_controls` from that report; it also records `stop_ok`. `compare()` extends the existing
`ENVIRONMENT_SENSITIVE` skip: today it fires when `errored_controls` differ, and it will also fire
when the stage outcome differs or the current one is not green. `undefined` is treated as green so
that a baseline recorded before this change keeps grading, which is the same "record, do not
grade, what has no history" rule `compare()` already applies to a missing metric.

The rejected alternative is removing `check_stop_tokens` from `RATCHETED`. It makes the red go
away and it deletes the measurement, which is the move the repository's own rule against weakening
a check to pass exists to prevent. The second rejected alternative is having `capture()` skip its
internal `stop` run when the tree is dirty: it would make the metric cheap and meaningless, and it
would also change what `pack_tokens_p50` and the rest are captured alongside.

B2 to B5 are test repairs. Each replaces an assertion that cannot fail, or adds one the plan
booked and never wrote. None of them changes production behaviour, and none relaxes an existing
assertion — the suite gets strictly more able to fail than it is today.

B6 applies the same predicate on the `only` path that `walk()` applies on the full one. It is one
filter, and it is here rather than in the incremental change because a latent defect that the next
change would activate is cheaper to fix while it is still latent.

## Out of scope

- The tolerance, and every recorded figure in `.aidlc/baseline.json`.
- Removing any metric from `RATCHETED`.
- `refresh()`'s double `fingerprint()` call, and the `HARNESS_OUTPUT` overlap with
  `test/install.test.mjs` — both real, both noted in the review, neither a behavioural defect, and
  neither in a file this change otherwise needs to touch.
- Incremental rebuild itself. B6 fixes what `only` does when called; it gives it no caller.
- `harness review`'s 180-second timeout, which is a separate defect in a separate module.

## Safeguards

- B1's skip is conditional on the stage outcome, so a green run grades exactly as before and the
  metric cannot quietly stop being enforced.
- A baseline with no recorded stage outcome keeps grading, so this change cannot silently disable
  the metric for every record written before it.
- The tolerance is untouched, and no recorded figure is edited.
- B2 to B5 only add or strengthen assertions; the suite ends more able to fail than it began,
  which is the test that this is a repair and not an accommodation.
- B6 lands before anything calls `only`, so no incremental rebuild ever ships without it.
