---
status: draft
source: docs/IMPROVEMENT-PLAN.md
source_revision: 89b5c20f6f54dfe06720fd38cb09e69e977d6443
parent: lean-review-skills-and-roles
---
# Spec: skills-earn-their-context

## Outcome

Every shipped skill has a recorded reason to exist: it is specific to this
harness, or it is generic and carries evidence. Prose meeting neither is gone,
and every project-specific rule — including each one an approved spec placed in
these files — is untouched. The README describes the inventory that ships. The
ceiling is stated as a spent budget with an entry condition, and a test refuses
the v6 answer, so the next skill or skill-distribution mechanism argues against
a recorded limit instead of filling a silence.

## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| local:prefer-concise-project-specific-guidance | B1, B2 |
| local:generic-recipe-needs-evidence | B1, B2, B4 |
| local:review-before-replacement | B1, B3 |
| local:no-pack-system | B4 |

## Observable behaviours

### B1

Given the seven skills under `.aidlc/skills/`,
When a reader asks why each is shipped,
Then `review.md` for this change records, per skill, the criterion it meets —
specific to this harness, or generic with named evidence — and cites the
evidence: the harness verbs, artifact sections, behaviour ids or gate semantics
it names, or for `map` the measured pack-bench numbers and the bench that holds
them. Where a skill meets neither criterion, the finding says so and recommends
an action with its reasoning. The recommendation is recorded; no skill is added
or deleted by this change, and `[limits]` is unchanged in either direction.

### B2

Given `.aidlc/skills/diagnose/SKILL.md` and `.aidlc/skills/change-safely/SKILL.md`,
When the generic prose that names nothing in this harness and carries no
recorded evidence is removed,
Then both files are shorter, and every project-specific instruction still
stands verbatim in meaning: the loop built from `harness check`, the
`harness new incident <slug>` path from a control-band breach to a linked intent
and a permanent eval, graph-first lookup with Grep as the miss path,
revision-specific product and design context with `git show` and `git grep`,
test locks and externally owned evaluation fixtures, the approved `## Files`
boundary, and `supersedes`/`extends` continuity. Each file keeps its `name` and
third-person `description`, stays under the 130-line stop, and contains no
numbered sequence longer than eight steps.

### B3

Given `README.md`,
When it describes which skills Claude selects on its own,
Then every skill and agent it names exists under `.aidlc/skills/` or
`.aidlc/roles/`. `pure-refactor`, removed at `3332615`, is not named as a
shipped skill anywhere outside `docs/BUILD-PLAN.md`, whose account of the
original twenty is history.

### B4

Given the README budget section and the lean-review skills row in
`docs/IMPROVEMENT-PLAN.md`,
When a reader asks what may be added to the skill surface,
Then those surfaces say plainly that the ceiling is inherited spent, that a
skill enters only with a failing eval or a defect recorded while building an
application through the harness, that a generic recipe a capable agent could
follow unaided is not by itself a reason to ship one, and that skills are not
distributed by any pack, bundle, overlay or per-domain marketplace mechanism
beyond the single kernel plugin. A test fails if a skill directory appears or
disappears without that decision, if `[limits]` moves, if a skill-pack or
overlay verb or registry table appears, or if the guidance stops stating the
limit.

## Design

This is a review and a freeze, not a mechanism. No library, check, hook, sensor
or CLI verb is added or edited. One new test file,
`test/skills-context.test.mjs`, states the ceiling by reading the shipped skill
directory, the registry and the guidance surfaces, in the same shape as
`test/limit-coordination.test.mjs` and `test/host-evidence.test.mjs`. The
per-skill assessment lives in `review.md`, where evaluator findings already
live, rather than in a new document class.

The rejected alternative is replacing `diagnose` and `change-safely` with
project-specific successors in this change. The review says review before
replacement, and a replacement written now would carry exactly the evidence the
row rejects — that a capable agent can follow it. Also rejected is deleting the
two skills to free ceiling headroom: an unevidenced deletion is the mirror of
an unevidenced addition, and three approved specs placed rules in those files
that would need somewhere else to live first.

## Out of scope

- Adding or deleting any skill, agent, hook binding, control or CLI verb.
- Any change to `[limits]`, or to how the budget check reads it.
- The four contract-chain skills and `map`: reviewed and recorded, not edited.
- A skill-selection, packaging, overlay or distribution mechanism of any kind.
- The generated `.claude/CLAUDE.md` and `.aidlc/instructions.md` beyond nothing:
  neither is edited, so `claude_md_lines` is untouched.
- Paid product trials.

## Safeguards

- Trimming must not remove an instruction an approved spec installed;
  `graph-first-retrieval`, `product-design-context` and `simplify-daily-guidance`
  own lines in these two files and their proof rows must keep passing.
- `test/contracts.test.mjs` keeps enforcing the description shape, the 130-line
  stop, the eight-step sequence rule, and that no document restates a budget
  number; `test/budget.test.mjs` keeps enforcing the counts.
- The freeze test must fail on a real change to the surface, not merely on a
  rename, so it reads the shipped directory and registry rather than a list it
  also writes.
- Skill bodies are agent context; shortening them lowers per-session cost and
  can only lower it, since no instruction is added.
