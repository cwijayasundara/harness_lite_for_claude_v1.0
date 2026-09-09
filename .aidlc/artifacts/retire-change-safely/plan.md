---
status: approved
spec_digest: sha256:ce948462e069761708b60487b7f9bb7db18a7816284715e1d69bffcb2ccc5957
spec_approval_digest: sha256:0fdcaeb7339cc919bbcc63f46de8b5abf6901cb366340f255298930a713732bc
by: cwijayasundara
at: 2026-09-09T05:30:44.202Z
digest: sha256:3d2cde0e47ae5c6fefff08fa99241373681963098437b8ef957ea188bc0b295f
approval_version: 2
approval_digest: sha256:5aa38b08766134c17be025b242aead9431735626ce8caccb89abe38347f026f3
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
- `README.md`
- `evals/agent-mechanisms.mjs`
- `docs/IMPROVEMENT-PLAN.md`

## Order

1. Read `implement`, `map` and `spec`, map every rule in `change-safely` to the
   file that states it, and write the mapping into
   `.aidlc/artifacts/retire-change-safely/review.md`, naming the one rule with
   no home.
2. Add that rule to the test-maintenance boundaries of
   `.aidlc/skills/implement/SKILL.md`.
3. Delete `.aidlc/skills/change-safely/SKILL.md` and its directory.
4. Update `test/skills-context.test.mjs`: the frozen set becomes the six that
   remain, and the surviving-rule assertions move to the files that now own
   them. Confirm the test fails if `change-safely` reappears.
5. Update `test/budget.test.mjs`: the recorded inventory is what is now shipped,
   and the red line moves one place, with the test named for what it proves.
6. Update `README.md`: the skill-selection sentence no longer offers
   `change-safely`, and the budget paragraph describes a partly spent budget
   without stating a number.
7. Update the skill list in `evals/agent-mechanisms.mjs`.
8. Record in the lean-review skills row in `docs/IMPROVEMENT-PLAN.md` that the
   recommendation was taken, when, and that the ceiling was deliberately left.
9. Run `harness check --stage stop`, then `--stage commit`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/skills-context.test.mjs`: the frozen skill set is the six that remain, and each rule the deleted file carried is asserted by name in `implement`, `map` or `spec`; `.aidlc/artifacts/retire-change-safely/review.md` records the sentence-by-sentence mapping the deletion rests on |
| B2 | `test/skills-context.test.mjs`: `implement` states the approved-requirement rule; `test/contracts.test.mjs` keeps proving its frontmatter, its generator binding, the 130-line stop and the eight-step rule |
| B3 | `test/budget.test.mjs`: the recorded inventory equals what is shipped, a project's first skill is accommodated and its second is refused with the stage red, and an unaccountable surface is still red rather than green; `test/contracts.test.mjs` keeps proving no document states a budget number of its own |
| B4 | `test/skills-context.test.mjs`: neither `README.md` nor `evals/agent-mechanisms.mjs` names `change-safely`, every skill the README presents as shipped resolves on disk, and the lean-review row records the decision and its date |

## Gate status

Prepared for review. Spec and plan remain drafts. Implementation starts after
the user's `harness approve` of spec, then plan.
