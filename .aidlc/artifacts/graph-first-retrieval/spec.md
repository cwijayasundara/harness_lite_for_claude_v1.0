---
status: draft
source: docs/IMPROVEMENT-PLAN.md
source_revision: a4118f5421454ba90e6e4388291fc92dd87b68c6
source_kind: repository
---
# Spec: graph-first-retrieval

## Outcome

The coding agent locates indexed code through the existing graph and budgeted
pack instead of starting with Glob/Grep, while Grep remains the honest miss
path and the graph does not grow new features.

## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| local:graph-is-the-retrieval-path | B1, B2 |
| local:miss-path-not-deny | B3 |
| local:freeze-expansion-repair-usage | B4 |

## Observable behaviours

### B1

Given the explorer role,
When it searches the codebase for a named symbol,
Then it may run `harness graph query` and `harness pack` (Bash allowed for
those lookups) and still must not have Write or Edit tools. `may_write`
remains false. Its instructions say graph/pack first, targeted Read of named
slices, and Grep/Glob only on a miss or a non-identifier search. It still
returns paths and line ranges, never whole files.

### B2

Given canonical instructions, the map skill, implement, and change-safely,
When an agent needs to find where something lives or what a change will
touch,
Then those surfaces say to locate with `harness graph query` / `harness pack`
first. Native Grep/Glob is the miss path, not the default. The map skill no
longer treats an available graph as skippable optional help. The lookup rule
is stated once per surface, in ordinary volume, without CRITICAL/YOU MUST
boosters or a numbered ritual that stacks on native reasoning.

### B3

Given Grep or Glob on a bare identifier the index already knows,
When the pre-tool hook runs,
Then the search is not denied. Compact caller advice may still accompany the
call. The hook does not inject a budgeted pack into that context. Graph and
pack CLI misses still tell the caller to grep rather than claiming the symbol
does not exist.

### B4

Given the 8 September lean-review row for graph, map and context packing,
When this change lands,
Then that row records: freeze feature expansion; repair usage so the agent
actually queries the existing index; consider removal only after a graph-first
versus Grep-first product comparison. Law 7 is unchanged. No new skill, agent,
hook binding or limit increase is added.

## Design

The graph, pack, map page, SessionStart hub lines and advisory `preSearch`
hint already exist. This change repairs who can call them and what steering
says, rather than adding retrieval machinery.

Explorer is the retrieval sidekick analogue from Devin Fusion: a cheaper
breadth worker that keeps the main context clean. It is not a second coding
model. Adding Bash is the minimum way it can invoke the existing CLI. Existing
pre-bash write and contract guards still apply. Explorer prose limits Bash to
graph/pack lookups; it does not gain Write/Edit.

Do not auto-inject packs. Cognition's Sidekick lesson, and the graph-on
comparison, is that unsolicited packed context on the main agent costs more
than it saves. Pack on demand.

Lance Martin's prompt-audit applies to this steering only: delete the
"optional graph does not block" hedge that undercuts lookup; do not add
verification rituals or emphasis boosters; do not add a prompt-audit skill.

## Out of scope

- Dual-model Fusion routing or a new sidekick agent.
- Denying Grep/Glob.
- New graph questions, tree-sitter, or product-context pack expansion.
- Paid native/graph product re-runs.
- Changing diagnose, evaluator, verifier, SessionStart budget inventory, or
  `team-reuse`.
- Closing or rewriting other changes' approvals.

## Safeguards

- Law 7 miss path remains executable and documented.
- Control budget stays at the registry `[limits]`; this change only edits
  existing role, skill and instruction files.
- Explorer cannot be granted Write or Edit.
- A graph miss must not be reported as proof of absence.
- Existing approval records are not rewritten.
