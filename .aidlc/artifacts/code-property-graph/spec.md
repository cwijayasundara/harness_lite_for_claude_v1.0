---
status: approved
source_digest: sha256:4e5ca318f767e590e24961b313042fb6c3cae006d0bab78e74a77b35fd0be843
source: docs/IMPROVEMENT-PLAN.md
source_revision: b5c4c2fc2329b48b31b97cbcb8859bf60d36f9ae
source_kind: repository
intent_digest: sha256:320efff2c6295e40f68b66f899e3141e58e84c34142ad28d7509439b4dd87c81
intent_input_digest: sha256:050c597f9018487f0739cb7b603ebf23646be17ecae3fc4e681600698f152e68
intent_revision: 4c3433f0ddbe66221df2166b810b03c93ee0ecf8
by: cwijayasundara
at: 2026-09-09T13:36:33.078Z
digest: sha256:bd3e93595f2bc2581de95d117c0a9637c09e2422d306e54edc68bd5921e1c799
approval_version: 2
approval_digest: sha256:39e56720a883056c7ca6a5e49fd05dca3bd9245dfbe780e8f7971cbb1fba6a50
---
# Spec: code-property-graph

## Outcome

The index becomes a property graph with three named edge types, built by a four-stage pipeline
whose every stage reports what it could not do, and ranked by a real PageRank rather than a degree
count. Locating a dependency costs fewer tokens than bounded search, or the benchmark says so and
the record keeps the number either way.

## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| user:three-typed-edges | B1, B4 |
| user:audit-and-deduplicate | B2 |
| user:anchor | B3 |
| user:pagerank | B5 |
| local:the-benchmark-is-the-exit-criterion | B6 |

## Observable behaviours

### B1

Given a built index,
When a caller asks the graph a question,
Then the index carries three named edge types — `import` (file → file), `call`
(function → function) and `co-edit` (file ↔ file) — each queryable by name, and every answer
names the edge type that produced it. A caller can request one edge type and receive only edges
of that type. The existing `callers`, `calls`, `cycles` and `changed-since` questions return what
they return today, so `pack.mjs`, `map.mjs` and the pre-search hook are unaffected by the
renaming alone.

### B2

Given a build over this repository's 541 modules,
When the audit-and-deduplicate stage runs,
Then the build reports, as counts and as an enumerable list: imports that resolved to nothing,
symbol names defined in more than one module, and duplicate edges collapsed. A `raw_import` that
resolves to nothing is recorded as unresolved rather than dropped silently as it is today at
`graph.mjs:223`. Each node and each edge appears once. `harness graph query` exposes the audit,
and a build whose unresolved share rises is visible to a reader without re-running the build.

### B3

Given `evals/fixtures/retrieval-app`, where `format` is exported by two modules,
When a caller resolves a reference to `format` from a specific call site,
Then the answer names the single definition that call site reaches, and separately reports that
the bare name is ambiguous across two modules. It does not return both definitions as equal
candidates, which is what the index does today. Where the reference genuinely cannot be resolved
to one definition, the answer says so and returns the candidates, rather than picking one.

### B4

Given a repository with git history,
When the co-edit stage runs,
Then it derives a weighted, symmetric file ↔ file edge from commits that changed both files, and
the weight reflects how often rather than merely whether. On this repository the edge
`test/guard.test.mjs ↔ test/lifecycle-cli.test.mjs` exists with a weight reflecting its nine
co-changes, despite no `import` or `call` edge between them. Given a repository with no git
history, or a shallow clone, the co-edit edge set is empty and the build succeeds; every other
edge type and every existing query is unchanged, so the feature degrades to absent rather than to
wrong.

### B5

Given the structural edges,
When ranking runs,
Then it is PageRank by power iteration with a damping factor, iterated to a stated convergence
tolerance or iteration cap, over `import` and `call` — not a fan-in/fan-out sum. A separate
ranking runs over `co-edit`. The two are reported separately and never blended into one score.
`query(g, 'hubs')` returns the structural PageRank ordering, so `map.mjs`, the SessionStart hubs
line and `baseline.mjs`'s pack sampling keep calling what they call today and receive a better
ordering. A repository with no co-edit edges yields no historical ranking and an unchanged
structural one.

### B6

Given `evals/bench/pack-bench.mjs`,
When it is run after the pipeline lands,
Then the recorded figures are pack tokens, bounded-`rg` tokens and recall for both, measured the
way they are measured today, and the result is written down whichever way it comes out. The
recorded 5,743-versus-3,436 result is the number this change is measured against. A result that
does not improve it is recorded as that, and the exit criterion at `pack-bench.mjs:6` — "if the
measured saving is not real, the graph gets cut" — is not retired, weakened or reinterpreted by
this change.

## Design

The pipeline is four named stages over the existing `build()`, in the order the user specified.

**Starter graph** is today's pass: discover files, parse imports and symbols per module. Unchanged
except that it emits typed edges into an edge list instead of leaving them implicit in
`raw_imports` and `symbols`.

**Audit and deduplicate** walks that edge list once. Unresolved imports become an `unresolved`
record rather than a silent `filter(Boolean)`; symbol names appearing in more than one module
become an `ambiguous` record; identical edges collapse. The stage's output is a report stored
beside the graph, which is what makes B2 observable without a rebuild.

**Anchor** resolves each call reference to one definition using the resolved `import` edges of the
referencing module: a call to `format` in a module that imports one of the two definers resolves
to that one. Where the module imports both, or neither, the reference stays ambiguous and is
reported as such. This is the smallest resolution rule that fixes the recorded `retrieval-app`
defect without a type system, and it is deliberately not stable identity across renames — that
was excluded by decision 2 in the intent.

**PageRank** is power iteration: uniform initial distribution, damping 0.85, dangling mass
redistributed uniformly, iterate until the L1 delta falls below a fixed tolerance or a fixed
iteration cap is reached, both stated as constants. It runs twice over disjoint edge sets —
once over `import` + `call`, once over `co-edit` — because decision 3 keeps them separate.

Co-edit weights come from `git log --name-only` over a bounded commit window, counting pairs
per commit. The window is a constant, not a setting: a knob here is a knob nobody tunes. A commit
touching an implausibly large number of files contributes nothing, so a bulk rename does not
manufacture a fully connected graph.

`GRAPH_VERSION` moves from 4, which invalidates every cached index; `ensure()` already rebuilds on
a version mismatch, so no migration is written.

**Line cost.** `graph.mjs` is 366 lines of a 4,841-line kernel, and the lean review names 33%
core growth as the standing risk. The expectation this spec sets: the ranking and the pipeline
stages stay inside `graph.mjs` and it ends under 550 lines; co-edit derivation, which is the only
part that shells out to git, goes in its own module under 90 lines. A design that needs more than
that is a design to bring back to the human, not to land quietly.

The rejected alternative is one blended PageRank over all three edge types. It produces a single
number that is easier to consume and impossible to explain — a file ranked high because it is
imported everywhere and a file ranked high because it churns with everything are different facts,
and a consuming project with no history would silently receive a different metric under the same
name. Rejected by decision 3.

## Out of scope

- Stable node identity across renames and file moves, and any symbol history across revisions.
  Excluded by decision 2.
- Any decision to remove, shrink or keep the graph. This change produces a measurement under B6;
  acting on it is separate, and the freeze reversal is recorded in the source document, not here.
- Changing `pack()`'s 1,200-token budget, its selection order, or what the pre-search hook emits.
- The SessionStart payload's contents. `a-baseline-measures-what-ships` owns that surface.
- Any new skill, hook binding, agent or `[limits]` change.
- Co-edit weights as a cross-project or shipped artefact. Weights are derived locally from the
  repository's own history and never committed.

## Out-of-order dependency

This change does not begin until the graph-first versus Grep-first comparison has produced a
recorded outcome, per decision 1. A tie or an incomplete run is a recorded outcome and unblocks
this change; an unrun comparison does not.

## Safeguards

- `evals/fixtures/` is untouched; `retrieval-app` is the test subject for B3, not edited to
  satisfy it.
- B6 keeps the existing exit criterion intact and forbids this change from reinterpreting it.
  A worse benchmark result is a reportable outcome, and the spec says so before the run.
- B4's degradation rule means a consuming project with no history gets today's behaviour, not a
  silently different ranking.
- The two rankings are never blended, so a reader can always tell which fact a rank came from.
- `GRAPH_VERSION` bumps, so no stale index is graded against the new pipeline.
- The line-cost expectation is stated before implementation, so exceeding it is a conversation
  rather than a discovery at review.
- `query()`'s existing question names keep their current contracts, so `test/graph.test.mjs`,
  `pack.mjs`, `map.mjs` and the pre-search hook are not silently repointed.
