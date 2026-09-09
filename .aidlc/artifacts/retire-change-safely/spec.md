---
status: draft
supersedes: skills-earn-their-context#B4, lean-v2#B3
source: docs/IMPROVEMENT-PLAN.md
source_revision: 088a3a0911faba198a79a7431185a270b85d64dc
parent: lean-review-skills-and-roles
---
# Spec: retire-change-safely

## Outcome

One skill fewer, no rule fewer. `change-safely` is deleted after every rule it
carried is shown to be stated elsewhere on the same task, with its one exception
moved to `implement` first. The ceiling stays where it is, so a consuming
project inherits one unused place instead of none — a reversal of two approved
claims, declared here rather than written around, with the budget's own red line
preserved one place further on.

## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| review:F2-change-safely-is-a-second-copy | B1, B2 |
| review:F3-nothing-supports-the-generic-remainder | B1 |
| user:2026-09-09-delete-it-and-leave-the-ceiling | B3, B4 |

## Observable behaviours

### B1

Given `.aidlc/skills/`,
When it is read,
Then `change-safely` is absent, six skills remain, and every harness-specific
rule the deleted file carried is still stated in a skill the agent reaches on
the same task: graph-first lookup in `map` and `implement`; test locks,
externally owned evaluation fixtures and the approved `## Files` boundary in
`implement`; `supersedes` and `extends` in `spec`; revision-specific product
context in `map`. `diagnose` and the five reviewed skills are unchanged.

### B2

Given `.aidlc/skills/implement/SKILL.md`,
When an agent reads its test-maintenance boundaries,
Then it states that an implementation bug is fixed to meet the approved
requirement rather than synchronised into it — the one rule `change-safely`
carried that no other skill stated. The file keeps its `name`, its third-person
`description`, its `context: fork` and its `model` bound to `[models].generator`,
stays under the 130-line stop, and gains no numbered sequence longer than eight
steps.

### B3

Given a project that has run `harness init`,
When the budget check measures it,
Then the recorded inventory counts what the harness actually ships, `[limits]`
is unchanged, and the project's own first skill is accommodated rather than
refused. The budget still goes red — one place later than before — and the stage
still fails rather than merely reporting when it does. A budget that cannot
account for a surface is still red, not green, and no document states a budget
number of its own.

### B4

Given `README.md`, `evals/agent-mechanisms.mjs`, the lean-review skills row in
`docs/IMPROVEMENT-PLAN.md` and `test/skills-context.test.mjs`,
When each names the skill inventory,
Then none of them names `change-safely`: the README no longer offers it as what
"refactor this" selects, no longer describes the inherited budget as spent, and
the guidance-comparison file list matches the shipped set. The lean-review row
records that the recommendation was taken and when, and the frozen set in
`test/skills-context.test.mjs` is the six that remain, so the next change to the
inventory still fails a test first.

## Design

A deletion, a one-sentence move, and the arithmetic that follows. No library,
check, hook, sensor or CLI verb is edited.

The sentence-by-sentence check in B1 is the whole safety argument, and it is
done before the file is removed rather than asserted after: each rule in the
deleted file is located in `implement`, `map` or `spec` by reading them, and
anything not found moves to `implement` first. `review.md` records the mapping
so a later reader can audit the deletion without reconstructing it from Git.

`supersedes` names two behaviours because the user's decision reverses a clause
of each. `skills-earn-their-context#B4` had the guidance state that the ceiling
is inherited spent; it no longer is. `lean-v2#B3` had the commit stage pass with
the budget spent; it now passes with the budget under. The surviving clauses of
both are restated here as B3 and B4 rather than left dangling: one budget in one
place, no document stating its own number, and a stage that goes red rather than
reporting.

The rejected alternative is lowering `[limits] skills` with the deletion, which
would keep both superseded clauses true and supersede nothing. The user chose
against it on 2026-09-09, so that the place the review freed is a place a
consuming project can use.

## Out of scope

- Any change to `diagnose` or to the five skills the review passed.
- Adding, renaming or re-scoping a control, hook binding, agent or CLI verb.
- Raising or lowering `[limits]`.
- Revisiting the entry condition, the no-pack limit, or anything else
  `skills-earn-their-context` froze beyond its B4 clause named above.
- Restoring the Pin / Sprout / Refactor procedures `simplify-daily-guidance`
  removed at `6d76857`; no defect asks for them.
- Paid product trials.

## Safeguards

- No rule may be lost: B1's mapping is verified by reading the surviving skills,
  and `test/skills-context.test.mjs` keeps asserting each surviving rule by name
  in the file that now owns it.
- `test/budget.test.mjs` keeps proving that the stage goes red and that an
  unaccountable surface is red rather than green; only the count at which red
  begins moves, and the test's name says so.
- `test/contracts.test.mjs` keeps enforcing the description shape, the 130-line
  stop, the eight-step rule and the single source of budget numbers.
- Deleting a skill removes a session-context cost and can only remove one, since
  no instruction is added anywhere except one sentence in `implement`.
- `harness init` consumers who matched on the deleted description lose that
  match; the README change tells a reader what selects that work instead.
