---
status: draft
---
# Plan: the-gate-grades-what-it-can-measure

## Approach

One field, one widened condition, four test repairs and one filter.

B1 is the urgent half: `capture()` records `stop_ok`, and `compare()`'s existing
`ENVIRONMENT_SENSITIVE` skip fires on a differing or non-green stage outcome as well as on a
differing toolchain. Nothing else about grading moves — same tolerance, same metrics, same finding
shape on a green tree.

B2 to B5 are the review's proof findings. Each is a test that could not fail, or one the plan
booked and never wrote. The discipline here is that the suite must end **more** able to fail than
it began: no existing assertion is relaxed, and each repair is demonstrated by removing the
production behaviour and watching the new assertion go red.

B6 is one filter on the `only` path, landed while the defect is still latent, because the
incremental refresh change is what would activate it.

## Files

- `.aidlc/lib/baseline.mjs`
- `.aidlc/lib/graph.mjs`
- `test/graph.test.mjs`
- `test/unit.test.mjs`
- `docs/IMPROVEMENT-PLAN.md`

## Order

1. Add the failing test first: the `baseline` control on a tree whose `stop` stage is not green
   reports `check_stop_tokens` as skipped rather than regressed, and the reason names the stage
   outcome. It must fail before step 2 exists — today that case returns a `fail` verdict with a
   `+15633%` finding. B1.
2. Record `stop_ok` in `capture()` and widen `compare()`'s skip in `.aidlc/lib/baseline.mjs`. B1.
3. Assert the other half of B1, which is what stops this being an accommodation: on a green tree
   the metric still grades, a rise beyond tolerance still fails with the same finding, and a
   baseline carrying no `stop_ok` still grades rather than skipping.
4. Replace the unfailable no-git test in `test/graph.test.mjs` with one against a directory that is
   genuinely not a repository, asserting the fingerprint value an empty commit component produces
   rather than its type. Add the no-commit case. B2.
5. Assert B3 at the `refresh()` boundary: across a commit that changes no working-tree file,
   `refresh()` does not return `{ skipped: 'clean' }`. B3.
6. Assert B4: `pack` for a symbol under an excluded path returns a miss naming search, not an
   absence. B4.
7. Add `-c commit.gpgsign=false` to the test's git helper and check `spawnSync` status, so a failed
   git call reports itself. B5.
8. Apply the harness-output exclusion on `build`'s `only` path in `.aidlc/lib/graph.mjs`, with a
   test that an incremental rebuild naming an excluded path does not index it. B6.
9. For each of steps 4 to 6, remove the production behaviour, confirm the new assertion fails, and
   restore it. A repair for a test that could not fail is worth nothing unless the replacement can.
10. Record in `docs/IMPROVEMENT-PLAN.md`: the review's verdict, the confirmed dirty-tree failure,
    what was repaired, and that every `--stage commit` run recorded on 2026-09-09 and 2026-09-10
    passed only because it followed a commit.
11. `harness check --stage commit` **on a dirty tree** and then on a clean one, and paste both.
    The first is the one that was impossible before this change.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/unit.test.mjs` — the `baseline` control against a recorded baseline whose `stop_ok` is true and a capture whose stage is not green reports `check_stop_tokens` skipped, with a reason naming the stage outcome, and the stage verdict is not `fail` on that metric alone; on a green capture a rise beyond 1.10 still fails with the same finding; a baseline with no `stop_ok` still grades. Written failing at step 1. |
| B2 | `test/graph.test.mjs` — `fingerprint()` against a `mkdtempSync` directory outside any repository returns the value an empty commit component produces, and against a git repository with no commit does the same. Fails if the empty-component branch is removed, demonstrated at step 9. |
| B3 | `test/graph.test.mjs` — `refresh()` called across an `--allow-empty` commit does not return `{ skipped: 'clean' }`. Asserted at the boundary the behaviour is stated at. |
| B4 | `test/graph.test.mjs` — `renderPack` output for a symbol under an excluded path names search as the next step and does not report absence. Fails if the miss path is removed, demonstrated at step 9. |
| B5 | `test/graph.test.mjs` — the git helper passes `-c commit.gpgsign=false` and asserts `status === 0`, so a refused commit reports itself rather than surfacing as a production assertion. Evidence is the code; the failure mode needs a machine with `commit.gpgsign=true` to observe. |
| B6 | `test/graph.test.mjs` — `build(cfg, { only: ['.aidlc/evals/...'], previous })` does not add that module to the index. |

`test/unit.test.mjs` and `test/graph.test.mjs` are `node:test`, so these are file-and-test-name
rows rather than pytest node ids. B5's row is a code property rather than an executed proof, and
says so.

## Coordination

This change has no `depends_on` and declares no `## Dependencies` table. It `extends:`
`the-index-tracks-the-source`, whose review produced every finding it repairs; that change is
delivered and nothing here waits on it. It reverses none of its behaviours, so `supersedes:` is
empty — B1 repairs a metric introduced by `a-baseline-measures-what-ships` and given its current
recorded value by the index change, and neither change's approved behaviour said the metric should
be graded when incomparable.

`.aidlc/lib/baseline.mjs`, `.aidlc/lib/graph.mjs`, `test/graph.test.mjs`, `test/unit.test.mjs` and
`docs/IMPROVEMENT-PLAN.md` are named in the `## Files` of delivered changes rather than in-flight
ones, so serialization is already satisfied. `a-pack-answers-the-question-asked` is drafted and
unapproved and also names `test/graph.test.mjs` and `docs/IMPROVEMENT-PLAN.md`; the two are
executed in sequence by the same worker, this one first, because a commit gate that cannot pass
blocks the other from being verified at all.
