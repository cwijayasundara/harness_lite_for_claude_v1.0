---
status: draft
source: docs/IMPROVEMENT-PLAN.md
source_revision: b5c4c2fc2329b48b31b97cbcb8859bf60d36f9ae
parent: lean-review-graph-retrieval
---
# Intent: code-property-graph

- **Date:** 2026-09-09
- **Author:** cwijayasundara
- **Source:** conversation, 2026-09-09. Requested directly: a code property graph carrying
  import (file → file), call (function → function) and co-edit (file ↔ file, from git history)
  edges, built by the process `starter graph → audit + deduplicate → anchor → PageRank`, to
  locate code dependencies efficiently. Captured as the "Graph retrieval, freeze reversed"
  finding of the cost and context control review in `docs/IMPROVEMENT-PLAN.md`, committed at the
  bound `source_revision`.

## Problem

The index today is not a property graph. It is a per-module record — `{ lang, raw_imports,
imports, symbols, lines }` across 541 modules — with edges implied by two of those fields and
read by `query()`. Three specific consequences.

**Two of the three requested edges exist; one does not.** `imports` is a resolved file → file
edge. `symbols` carries per-symbol calls, which `query(g, 'calls' | 'callers')` reads as a
function → function edge. There is no co-edit edge and no git history in the index at all. That
signal is available and non-redundant: over the last 400 commits, `test/guard.test.mjs` and
`test/lifecycle-cli.test.mjs` changed together nine times with no import or call edge between
them, and `.aidlc/hooks/dispatch.mjs` co-changed with `test/guard.test.mjs` ten times. A change
to one of those files today produces no signal pointing at the other.

**Symbols are keyed by bare name, so lookups are ambiguous and unaudited.** `query()` matches a
term against `s.name` across every module, and `pack()` collects every definition that matches.
Nothing resolves a call site to the definition it actually reaches, and nothing reports that a
name was ambiguous. This is a recorded defect, not a hypothesis: `evals/fixtures/retrieval-app`
was built on 2026-09-09 precisely because `format` is exported by two modules and "a careless
lookup lands in the wrong place." The index reproduces that carelessness rather than catching it.
There is no audit stage — a `raw_import` that resolves to nothing is dropped silently at
`graph.mjs:223`, and no one is told how much of the graph failed to resolve.

**Ranking is degree-counting, and the code says so.** `query(g, 'hubs')` sums fan-in and fan-out.
`graph.mjs:267` carries the warning in the source itself — a naive hub metric "is how a graph
looks useful while telling you nothing." Degree cannot distinguish a file imported once by the
entry point from a file imported ten times by leaves. The five hubs surfaced at every SessionStart
are produced by that metric.

The cost of the current design is measured and unfavourable. The lookup benchmark records
**5,743 graph-pack tokens against 3,436** for bounded `rg` search, both at full recall. An index
that costs more than the search it replaces is not yet locating dependencies efficiently.

## Proposed outcome

The index is a property graph with typed edges, built by an auditable pipeline, and it answers
"what does this change reach" better per token than bounded search does.

Observable from outside the system:

- The index carries three named edge types — `import` (file → file), `call` (function → function),
  `co-edit` (file ↔ file, weighted from git history) — each queryable by name, and a reader can
  ask which edge type produced a given answer.
- A build reports what it could not resolve: unresolved imports, ambiguous symbol names, and
  duplicate definitions, as counts and as a list, rather than dropping them silently.
- A call site resolves to a specific definition, not to every definition sharing its name. On
  `evals/fixtures/retrieval-app`, a query for `format` reports which module the call site reaches
  and reports the ambiguity, rather than returning both.
- Ranking is reach-based rather than degree-based, and the hubs surfaced at SessionStart are
  produced by it.
- The pack benchmark is re-run and the token figure against bounded `rg` is recorded, whichever
  way it comes out.

## Affected users and systems

- `.aidlc/lib/graph.mjs` — `build()`, `query()`, `GRAPH_VERSION`, and the on-disk shape.
- `.aidlc/lib/pack.mjs` — retrieval reads the graph and pays its token cost.
- `.aidlc/lib/map.mjs` and the SessionStart hubs line — the ranking's most visible consumer.
- `.aidlc/lib/refresh.mjs` and the Stop hook — incremental rebuild; co-edit edges derive from
  git history, which changes on commit rather than on write.
- `evals/bench/pack-bench.mjs` — the benchmark that decides whether this earned its place.
- `.aidlc/state/graph.json` — 541 modules today; a schema change invalidates every cached index.
- Consuming projects, whose graphs rebuild on upgrade.

## Constraints

- **This reverses a recorded freeze, and does so explicitly.** `docs/IMPROVEMENT-PLAN.md`'s lean
  review of 8 September 2026 sets "Graph, map and context packing — Freeze feature expansion" and
  states that removal "still needs a graph-first versus Grep-first product comparison, which does
  not exist." The user directed this expansion on 2026-09-09 with that position in view. The
  source document now records the reversal, its date and its reason under "Graph retrieval, freeze
  reversed", and leaves the original row as written — so a later reader sees both what the freeze
  said and when it stopped applying, rather than a rewritten history.
- Law 11: a control enters only with a failing eval or a defect recorded while building an
  application through the harness. This is not a new control — it is the existing index — but the
  ambiguity defect (`retrieval-app`, `format` in two modules) and the recorded 5,743-vs-3,436
  token result are the evidence that grounds it. The spec should cite them rather than argue from
  the shape of the design.
- Zero dependencies. No graph library, no PageRank package. The power iteration is a few lines.
- `[limits]` is at 6/7 skills, 4/5 hooks, 4/5 hook bindings, 255/600 hook LOC, 97/120 CLAUDE.md
  lines. None is raised to land this. No new skill and no new hook binding.
- The kernel is 4,841 lines and `graph.mjs` is 366 of them. The lean review already records 33%
  growth in the executable core and names it as the risk. A pipeline that triples the graph module
  argues against the review's own finding, so the spec should state the line cost it expects.
- Git history here is 457 commits from 2026-08-23 — short, and produced almost entirely by the
  harness governing itself. Co-edit weights learned from it describe this repository's development,
  not software in general, and a consuming project starts with no history at all. The co-edit edge
  must degrade to absent rather than to wrong.
- `evals/fixtures/` is write-protected; `retrieval-app` is used as a test subject, not edited.
- The benchmark is the exit criterion the repository already set for this surface: "If the
  measured saving is not real, the graph gets cut — that is the deal" (`pack-bench.mjs:6`). This
  change does not get to retire that deal by making the graph larger.

## Decisions taken

Recorded from the user on 2026-09-09, in answer to this intent's original open questions.

1. **The graph-first versus Grep-first comparison runs first.** It prices the current index and
   gives this change a baseline to beat, at the cost of one paid run against the authorised
   ceiling before any code is written. This change does not start until that run has produced a
   recorded outcome — including a tie or an incomplete run, which are reportable outcomes under
   `graph-first-versus-grep-first#B3`.

2. **`anchor` means resolving a reference to a specific definition** — binding a call site to the
   module that actually defines the symbol it reaches, so an ambiguous name is resolved or
   reported rather than returned twice. It does not mean stable node identity across renames and
   file moves; symbol history across revisions stays out of scope.

3. **Co-edit ranks separately from the structural edges.** Two rankings, not one blended score:
   a structural rank over `import` and `call`, and a historical rank over `co-edit`. "This is
   central in the code" and "this changes with that" stay distinct, and a consuming project with
   no git history loses the second while keeping the first.

4. **PageRank is a real PageRank** — power iteration with a damping factor to convergence, not a
   weighted degree count wearing the name. It extends `query(g, 'hubs')` in place if that question
   fits its consumers, rather than adding a parallel question; `map.mjs`, the SessionStart hubs
   line and `baseline.mjs`'s pack sampling keep calling what they call today.

## Open questions

None blocking. Decision 4 changes what every session is shown in the hubs line, which is the
surface `a-baseline-measures-what-ships` is concurrently making measurable and gated — the two
changes must be sequenced so the ranking change lands against a baseline that already measures
the real payload, or the corrected figure and the ranking change arrive as one unattributable
movement.
