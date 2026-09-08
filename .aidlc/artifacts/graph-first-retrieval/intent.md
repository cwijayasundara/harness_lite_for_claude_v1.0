---
status: draft
source: docs/IMPROVEMENT-PLAN.md
source_revision: a4118f5421454ba90e6e4388291fc92dd87b68c6
parent: lean-review-graph
---
# Intent: graph-first-retrieval

- **Date:** 2026-09-08
- **Author:** Grok, recording the user's approved design
- **Source:** Lean review, 8 September 2026 in `docs/IMPROVEMENT-PLAN.md` at
  `a4118f5`, plus the conversation that rejected a removal-first experiment and
  approved graph-first retrieval.

The user approved this design in conversation on 2026-09-08. That is recorded
here as intake authority, not a spec or plan approval and not a claim that they
ran `harness approve`.

## Problem

The code graph and budgeted packs exist so a coding agent can locate symbols
without Glob/Grep tree walks that fill the context window. In practice the
agent is not steered to use them.

The 8 September lean review then treated the graph as a removal candidate
because advisory packing had shown no product-cost advantage. That measurement
stuffed packs into prompts and left native search as the default. It did not
test graph-first lookup. The explorer role, whose job is cheap breadth search,
is limited to Read/Grep/Glob and cannot run `harness graph query` or
`harness pack`. Implement and change-safely guidance never names the pack.
The map skill tells the model the graph is optional.

## Proposed outcome

Claude Code locates indexed symbols through `harness graph query` and
`harness pack` (directly or via explorer) before native search. Grep and Glob
remain the miss path for unknowns, literals and non-indexed files. Graph
feature expansion stays frozen. No second coding agent, no denied search
tools, and no new skills, roles or hook bindings.

## Affected users and systems

Coding agents using this harness (especially explorer, implement and
change-safely); SessionStart map summary; canonical instructions; the lean
review disposition in the improvement plan.

## Constraints

- Law 7: the graph is a cache with a miss path, never a required input.
- Do not deny Grep or Glob.
- Do not add a Fusion/Sidekick dual-model agent.
- Do not raise `[limits]`. Add no production skills, agents or hook bindings.
- Do not dump unsolicited 1200-token packs into SessionStart or Grep context.
- Do not expand graph query types, product-context packing, or tree-sitter.
- Do not modify `team-reuse` or rewrite existing approvals.
- Prompt-audit: no CRITICAL/YOU MUST NEVER GREP; state the lookup rule plainly.

## Open questions

None
