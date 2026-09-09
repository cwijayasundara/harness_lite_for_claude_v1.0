---
status: draft
source: docs/IMPROVEMENT-PLAN.md
source_revision: 088a3a0911faba198a79a7431185a270b85d64dc
parent: lean-review-skills-and-roles
---
# Intent: retire-change-safely

- **Date:** 2026-09-09
- **Author:** Claude, recording the user's decision to act on the deletion
  recommendation recorded by `skills-earn-their-context`
- **Source:** `.aidlc/artifacts/skills-earn-their-context/review.md`, findings F2
  and F3 and the recommendation that follows them, and the user's decision of
  2026-09-09 to take it and to leave the ceiling where it is.

## Problem

`change-safely` was reviewed at `89b5c20` and found to be largely a second copy.
Most of its harness-specific rules are already stated where the agent meets
them: graph-first lookup in `map` and again in `implement`; test locks, external
fixture ownership and the `## Files` boundary in `implement`; `supersedes` and
`extends` in `spec`; revision-specific product context in `map`.

That review's finding F2 said only one rule had no second home. Checked sentence
by sentence rather than by rule family, four do: distinguishing a preserved
contract from a defect the approved change is meant to fix; fixing an in-scope
defect after reproducing it while recording unrelated bugs for separate work;
fixing an implementation bug to meet the approved requirement rather than
synchronising it into the requirement; and approval alone not retiring delivered
behaviour, with historical permission never authorising new work. `implement`
and `plan` speak of reusing tests for preserved behaviour, `diagnose` of
reproducing before fixing, and `intent` of not re-asking a decision already
given — near neighbours, none of them the same rule. Four generic rules also
have no home and are dropped: the coverage-percentage caution, characterisation
recording reality, the optional separate test commit, and the tested-helper
seam.

What is left after `skills-earn-their-context` cut its generic table is the
residue of `simplify-daily-guidance` at `6d76857`, which removed the concrete
Pin / Sprout / Refactor procedures and left prose in their place. No recorded
defect and no eval supports what remains, and the skill costs a description in
every session's context and a place against the ceiling.

The user has decided to delete it, and to leave `[limits] skills` at its current
value rather than lowering it with the deletion. That second decision reverses
two approved claims. `lean-v2#B3` says the commit stage passes with the budget
spent; `skills-earn-their-context#B4` says the guidance states the ceiling is
inherited spent. With one fewer skill shipped and the ceiling unchanged, both
sentences stop describing the harness: a consuming project now has one place of
its own before the budget goes red, and `test/budget.test.mjs` asserts the
opposite in "a project inherits a spent budget, not an empty one".

## Proposed outcome

`change-safely` is gone. Its one unduplicated sentence lives in `implement`,
where the agent already reads the rest of that paragraph's subject. No other
rule is lost, because every other rule is already stated somewhere the agent
reaches on the same task.

The budget's arithmetic is honest again: the install record counts what is
actually shipped, the ceiling stays where it is, and the README and the budget
test say what is now true — a project inherits a partly spent budget, with the
places the harness did not use left to it. The two reversed behaviours are named
in `supersedes`, not written around.

Nothing else changes. No control, hook, agent or verb is added, the ceiling is
not raised, and `diagnose` is untouched: its incident path has no second home
anywhere and this change makes no claim about it.

## Affected users and systems

Agents, which stop loading one skill description each session; projects running
`harness init`, whose recorded inventory and remaining budget both change;
`evals/agent-mechanisms.mjs`, whose guidance comparison reads the skill set by
name; readers of the README's budget and skill-selection sections.

## Constraints

- Delete exactly one skill. Do not touch `diagnose` or the five that passed the
  review.
- Do not change `[limits]`, and do not add a control, hook binding, agent, skill
  or CLI verb.
- Do not lose a rule: every sentence removed with the file must already be
  stated in `implement`, `map` or `spec`, verified sentence by sentence, or it
  moves to `implement` first.
- Do not restate a budget number in prose; `test/contracts.test.mjs` reads every
  document for one.
- Reversed behaviours are declared with `supersedes:` in the spec frontmatter,
  never argued around in prose.
- `test/budget.test.mjs` keeps proving that a project's budget goes red; only
  the point at which it goes red moves.

## Open questions

None
