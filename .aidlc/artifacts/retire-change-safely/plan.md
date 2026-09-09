---
status: approved
spec_digest: sha256:81196a426796f2da50b746d11c8def2ab92223cc35d294cb1fd0522e93fb6f26
spec_approval_digest: sha256:9e26499c386568a05107f44e6617956d880de764c26ae37fd6aa63215648ff9c
by: cwijayasundara
at: 2026-09-09T05:41:53.150Z
digest: sha256:2080bc4688e142d3afa4c492378a92fac1e465e5a0c3e3d7786a9f5d63164574
approval_version: 2
approval_digest: sha256:74ef0e590f3867ccb8b858f236622802e82108200d8e72cd993ffdf91aede233
---
# Plan: retire-change-safely

## Approach

Prove the deletion is safe before making it. Read `implement`, `map` and `spec`
and locate every rule `change-safely` states; write the mapping into `review.md`;
move the one rule with no home into `implement`; only then delete the file. A
deletion justified after the fact is a deletion nobody can audit.

The rest follows the arithmetic. `harness init` counts what it ships, so the
recorded inventory changes on its own; `test/budget.test.mjs` has to say the new
truth, which is that a project's own first skill now fits and the second does
not. That test keeps its shape — install, add skills, expect red, expect the
stage to fail rather than report — so the property it proves is preserved and
only the count moves. `test/skills-context.test.mjs` is the lock this change has
to unlock deliberately: its frozen set and its `change-safely` assertions are
edited to the six that remain, which is the conversation the lock exists to
force.

Both superseded clauses are named in the spec frontmatter. Nothing in this plan
weakens an assertion to get green: the two tests it edits are edited because the
approved behaviour under them changed, and each keeps an equivalent assertion on
the new behaviour.

## Files

- `.aidlc/skills/change-safely/SKILL.md`
- `.aidlc/skills/implement/SKILL.md`
- `test/skills-context.test.mjs`
- `test/budget.test.mjs`
- `test/graph-first.test.mjs`
- `README.md`
- `evals/agent-mechanisms.mjs`
- `docs/IMPROVEMENT-PLAN.md`

## Order

1. Read `implement`, `map`, `spec`, `intent` and `diagnose`, map every sentence
   in `change-safely` to the file that states it, and write the mapping into
   `.aidlc/artifacts/retire-change-safely/review.md`, separating the
   harness-specific rules with no home from the generic ones being dropped, and
   recording the correction to F2.
2. Add the four rules B2 names to `.aidlc/skills/implement/SKILL.md`, in its
   implementation and test-maintenance boundaries.
3. Delete `.aidlc/skills/change-safely/SKILL.md` and its directory.
4. Update `test/skills-context.test.mjs`: the frozen set becomes the six that
   remain, and the surviving-rule assertions move to the files that now own
   them. Confirm the test fails if `change-safely` reappears.
5. Update `test/budget.test.mjs`: the recorded inventory is what is now shipped,
   and the red line moves one place, with the test named for what it proves.
6. Update `README.md`: the skill-selection sentence no longer offers
   `change-safely`, and the budget paragraph describes a partly spent budget
   without stating a number.
7. Update the skill list in `evals/agent-mechanisms.mjs`, and remove the deleted
   file from the steering-surface map in `test/graph-first.test.mjs`, which
   reads it by path. Every assertion that test makes over the remaining
   surfaces is kept; only the deleted surface leaves the map.
8. Record in the lean-review skills row in `docs/IMPROVEMENT-PLAN.md` that the
   recommendation was taken, when, and that the ceiling was deliberately left.
9. Run `harness check --stage stop`, then `--stage commit`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/skills-context.test.mjs`: the frozen skill set is the six that remain, and each harness-specific rule the deleted file carried is asserted by name in `implement`, `map` or `spec`; `.aidlc/artifacts/retire-change-safely/review.md` records the sentence-by-sentence mapping, including the four generic rules deliberately dropped |
| B2 | `test/skills-context.test.mjs`: `implement` states each of the four rules B2 names, asserted individually so losing one fails; `test/contracts.test.mjs` keeps proving its frontmatter, its generator binding, the 130-line stop and the eight-step rule |
| B3 | `test/budget.test.mjs`: the recorded inventory equals what is shipped, a project's first skill is accommodated and its second is refused with the stage red, and an unaccountable surface is still red rather than green; `test/contracts.test.mjs` keeps proving no document states a budget number of its own |
| B4 | `test/skills-context.test.mjs`: neither `README.md` nor `evals/agent-mechanisms.mjs` names `change-safely`, every skill the README presents as shipped resolves on disk, and the lean-review row records the decision and its date; `test/graph-first.test.mjs` keeps proving graph-first steering over every surface that still exists |

## Gate status

Prepared for review. Spec and plan remain drafts. Implementation starts after
the user's `harness approve` of spec, then plan.
