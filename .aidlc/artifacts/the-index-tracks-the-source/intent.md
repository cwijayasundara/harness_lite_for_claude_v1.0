---
status: draft
source: docs/IMPROVEMENT-PLAN.md
source_revision: b5c4c2fc2329b48b31b97cbcb8859bf60d36f9ae
parent: lean-review-graph-retrieval
---
# Intent: the-index-tracks-the-source

- **Date:** 2026-09-09
- **Author:** cwijayasundara
- **Source:** the "Graph retrieval, freeze reversed" finding of the cost and context control
  review in `docs/IMPROVEMENT-PLAN.md`, committed at the bound `source_revision`. Both problems
  below were found while building `code-property-graph`, which this change extends.

## Problem

Two ways the index fails to describe the current source. Neither is a defect in
`code-property-graph`'s approved behaviours; both were discovered by them.

**It indexes its own history.** `code-property-graph`'s audit stage, landed at `e058fb8`, made the
composition of the index visible for the first time. Of 543 indexed modules, 92 are real source.
The other 451 are directories the harness itself writes: 377 recorded comparison runs under
`.aidlc/evals/comparisons/`, 50 agent worktree copies under `.claude/worktrees/`, and 17 recorded
product runs. `[graph] exclude` lists `node_modules`, `.venv`, `dist`, `.git`, `__pycache__` and
`fixtures`; it never excluded the harness's own output.

The consequences are not cosmetic. The audit reports 282 ambiguous symbol names, and the samples
are one `src/ledger.mjs` copied into sixty recorded run directories rather than a real collision.
The index is 620 KB, most of it evidence. And the ranking `code-property-graph#B5` is about to
replace fan-in counting with PageRank would rank those copies as the most central files in the
repository — making the SessionStart hubs line worse than the metric it replaces, on the surface
`a-baseline-measures-what-ships` has just made measurable and gated.

**Co-edit weights rot silently.** `fingerprint(cfg)` hashes discovered paths and their contents.
`refresh()` compares it and returns `{ skipped: 'clean' }` when it matches. A `git commit` changes
co-edit weights — they are derived from history — while touching no working-tree file, so the
fingerprint is identical and the refresh is skipped. `code-property-graph#B4` adds that edge type;
nothing in the existing freshness loop can see it move.

The rest of the freshness loop is sound and this change does not disturb it: `refresh()` rebuilds
whole rather than patching, so a global property like a rank cannot lag the modules it summarises,
and `load()` returns `null` on a fingerprint mismatch, so a stale index is a miss that sends the
caller to search rather than a confident wrong answer.

## Proposed outcome

The index describes the current source and nothing else.

Observable from outside the system:

- No path the harness itself wrote appears in the index, and a project's own `[graph] exclude`
  keeps working alongside that.
- A commit that changes no working-tree file still invalidates the index, so history-derived
  edges are recomputed rather than reported as clean.
- The rebuild is fast enough to keep doing on every turn, and the figure is recorded rather
  than asserted.
- A stale index remains a miss rather than a wrong answer.

## Affected users and systems

- `.aidlc/lib/graph.mjs` — `discover()`'s exclusions and `fingerprint()`.
- `.aidlc/lib/refresh.mjs` — the per-turn rebuild whose cost this changes in both directions.
- `.aidlc/lib/map.mjs` and `CODEBASE-MAP.md` — the module count and hubs both move.
- `.aidlc/lib/pack.mjs` and the pre-search hook — fewer candidate modules, same miss path.
- Every consuming project: they inherit the same defect today and would each have to fix it by
  hand in their own `[graph] exclude`.
- `code-property-graph`, which this extends: its B5 ranking is only worth landing once B8 has.

## Constraints

- `extends: code-property-graph`. This adds behaviours; it reverses none of that change's, so
  nothing is listed in `supersedes:`.
- The exclusion belongs in the library, not in this repository's `[graph] exclude`, because the
  directories are created by the harness rather than by any project. A project's own list stays
  additive.
- `[limits]` is unchanged; no new skill, hook, agent or control.
- Zero dependencies.
- The line-cost expectation `code-property-graph` set still applies: `graph.mjs` under 550 lines.
- Excluding a directory must not change what a *miss* means. `pack.mjs` and the pre-search hook
  keep their existing fall-back-to-search behaviour, so a module that is no longer indexed is
  found by search rather than reported absent.
- The module count on this repository drops from 543 to roughly 92. `graph_modules` and
  `graph_symbols` are recorded in `.aidlc/baseline.json` but are not in `RATCHETED`, so this is a
  recapture rather than a regression — and the recapture must say which it is, exactly as
  `a-baseline-measures-what-ships` had to.

## Open questions

None blocking. One judgement recorded rather than asked: `.aidlc/artifacts/**` contains seven
`.mjs` reproduction and post-fix scripts, which are real source that a reader may want indexed,
so they stay. Only the machine-written run directories and worktree copies go.
