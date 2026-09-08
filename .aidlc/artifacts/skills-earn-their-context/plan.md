---
status: draft
---
# Plan: skills-earn-their-context

## Approach

Do the review first, record it, then cut only what the review's criterion
condemns, then state the limit and hold it.

`test/skills-context.test.mjs` is the lock. It reads the shipped
`.aidlc/skills/` directory, `.aidlc/harness.toml` and the guidance surfaces, and
fails when the skill set changes, when `[limits]` moves, when a pack, bundle,
overlay or skill-registry verb appears in `.aidlc/bin/harness`, or when the
guidance stops stating the entry condition. It freezes the set by literal name
rather than by counting, so a swap fails as loudly as an addition; the per-skill
reasoning lives in `review.md`, which a permanent test should not be coupled to.

The cuts are governed by one rule applied to each paragraph: if it names nothing
in this harness and no record says an agent got it wrong without it, it goes.
Everything an approved spec installed stays, so before each cut the paragraph is
checked against the three plans that own lines in these files —
`graph-first-retrieval`, `product-design-context` and `simplify-daily-guidance`.
The strongest candidates found in the review are `diagnose`'s `## Anti-patterns`
section, which arrived at `303b58b` before any lean-era spec and names nothing
in this repository, and the generic situation/approach table in
`change-safely`, whose sharper predecessor `simplify-daily-guidance` already
replaced. `README.md:233` names `pure-refactor`, deleted at `3332615`, and is a
straight defect fix.

Only B4's guidance assertions and the README defect fail before the edits; the
rest of the lock describes a surface that is already correct and passes on first
run. Each such assertion is verified to fail under a deliberate temporary
mutation of the surface it guards before that mutation is reverted, so the lock
is proved to bite rather than merely to be green.

The alternative — replacing the two generic skills with project-specific
successors now — is rejected in the spec: the review asks for review before
replacement, and a successor written today would rest on exactly the evidence
the row refuses.

## Files

- `test/skills-context.test.mjs`
- `.aidlc/skills/diagnose/SKILL.md`
- `.aidlc/skills/change-safely/SKILL.md`
- `README.md`
- `docs/IMPROVEMENT-PLAN.md`

## Order

1. Assess all seven skills against the criterion and write the result into
   `.aidlc/artifacts/skills-earn-their-context/review.md`, one finding per
   skill, citing the harness verbs, artifact sections or measured evidence each
   names, and recommending an action for any that meets neither test.
2. Add `test/skills-context.test.mjs` with the B1–B4 assertions. Confirm the
   guidance assertions fail and the rest pass, then confirm each already-passing
   assertion fails under a temporary mutation of the surface it guards.
3. Cut the condemned prose from `.aidlc/skills/diagnose/SKILL.md`, checking each
   removed paragraph against the three owning plans first.
4. Cut the condemned prose from `.aidlc/skills/change-safely/SKILL.md` under the
   same check.
5. Fix `README.md:233` to name shipped skills, and state the entry condition and
   the no-pack limit in the README budget section.
6. Rewrite the lean-review skills row in `docs/IMPROVEMENT-PLAN.md` to record the
   decision, what it forbids, and where the per-skill review lives.
7. Run `harness check --stage stop`, then `--stage commit`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `.aidlc/artifacts/skills-earn-their-context/review.md`: one recorded finding per shipped skill with its criterion and evidence; `test/skills-context.test.mjs` freezes the seven names and `[limits]`, so an added, removed or renamed skill fails; `test/budget.test.mjs` keeps proving the counts |
| B2 | `test/skills-context.test.mjs`: both files are shorter than at `89b5c20` and still carry `harness check`, `harness new incident`, graph-first with Grep as the miss path, `git show`/`git grep` revision context, test locks, external fixture ownership, the approved `## Files` boundary and `supersedes`/`extends`; `test/contracts.test.mjs` keeps proving the description shape, the 130-line stop and the eight-step rule |
| B3 | `test/skills-context.test.mjs`: every skill and agent name `README.md` presents as shipped resolves to a directory under `.aidlc/skills/` or a file under `.aidlc/roles/`, and `pure-refactor` appears in no document but `docs/BUILD-PLAN.md` |
| B4 | `test/skills-context.test.mjs`: the README budget section and the lean-review row state the spent ceiling, the failing-eval-or-recorded-defect entry condition and the absence of any pack, bundle or overlay distribution; `.aidlc/bin/harness` carries no pack, bundle, overlay or skill-registry verb; `test/contracts.test.mjs` keeps proving no document restates a budget number |

## Gate status

Prepared for review. Spec and plan remain drafts. Implementation starts after
the user's `harness approve` of spec, then plan.
