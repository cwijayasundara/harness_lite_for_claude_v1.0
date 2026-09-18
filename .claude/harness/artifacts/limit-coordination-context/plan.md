---
status: approved
spec_digest: sha256:744a635cb819e2054aef89f65ee5d9879098b12f7a52bde49112194a85fdc41c
spec_approval_digest: sha256:f0888f56dc527c129756794853854cac1e699f51d9e07d497994f51eda32f7eb
by: cwijayasundara
at: 2026-09-08T20:28:31.158Z
digest: sha256:12047e17096aeb9f42ed31fad0e05dc0379fb458cd6c8362dcf6b3231948929b
approval_version: 2
approval_digest: sha256:f709ff5686d227946bdca4f7ebc8052d57ad17c26fa199d4ff372c1c8dfa5070
---
# Plan: limit-coordination-context

## Approach

Reuse the existing coordination filter and product-context commands. Teach
`status` to show the selected change's slice, and rewrite the daily
guidance so tracker URLs and `git show` / `git grep` are the default
inspection path. Do not add readers, schemas, verbs, or packing features.

The alternative — strip `delivery.json` and revision packing now — would
reverse demonstrated item-E behaviour without a comparison. Freeze and
steer instead, matching the graph-first disposition item.

## Files

- `.aidlc/bin/harness`
- `README.md`
- `.aidlc/instructions.md`
- `.claude/CLAUDE.md`
- `.aidlc/skills/intent/SKILL.md`
- `.aidlc/skills/plan/SKILL.md`
- `.aidlc/skills/map/SKILL.md`
- `.aidlc/policies/review.md`
- `.aidlc/templates/intent.md`
- `docs/IMPROVEMENT-PLAN.md`
- `test/limit-coordination.test.mjs`
- `test/coordination.test.mjs`

## Order

1. Add failing tests in `test/limit-coordination.test.mjs` for selected-change
   status slices, freeze of schedule/assign verbs and delivery schema, tracker
   and Git-read steering, and the lean-review row. Extend
   `test/coordination.test.mjs` only if the existing slug-filter cases need
   the selected-change default.
2. Pass the selected change into `coordination()` from the `status` case in
   `.aidlc/bin/harness` when no slug is given.
3. Shorten README coordination and product sections to demonstrated needs,
   tracker links, and `git show` / `git grep`.
4. Update instructions, intent/plan/map skills, review policy, and the intent
   template; regenerate `.claude/CLAUDE.md` with `harness init`.
5. Rewrite the lean-review coordination row in `docs/IMPROVEMENT-PLAN.md`.
6. Run `harness check --stage stop`, then commit-stage diagnostics.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | Existing `test/coordination.test.mjs` coverage of parent coverage, depends_on, overlaps, tracker projections, and no-authority findings remains passing |
| B2 | `test/limit-coordination.test.mjs` (and coordination slug cases if extended): selected change filters `status` / `status --json`; explicit slug still filters; no selection keeps the full local view |
| B3 | `test/limit-coordination.test.mjs` and existing `test/product-context.test.mjs`: product query still requires `--revision`, still names git fallback, delivery schema keys unchanged, pack `--revision` still exists without new options |
| B4 | `test/limit-coordination.test.mjs` asserts instructions, README, intent/plan/map skills and review policy name tracker URLs and `git show`/`git grep`; they do not advertise pack-revision as assignment or a delivery platform; improvement-plan row records the limit |
| B5 | `test/limit-coordination.test.mjs` help/usage has no schedule/assign verb; `test/budget.test.mjs` / `test/contracts.test.mjs` still enforce unchanged `[limits]` and skill/agent counts |

## Gate status

Prepared for review. Spec and plan remain drafts. Implementation starts after
the user's `harness approve` of spec, then plan.
