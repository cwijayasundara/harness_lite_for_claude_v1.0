---
status: approved
source_digest: sha256:4e5ca318f767e590e24961b313042fb6c3cae006d0bab78e74a77b35fd0be843
source: docs/IMPROVEMENT-PLAN.md
source_revision: b5c4c2fc2329b48b31b97cbcb8859bf60d36f9ae
source_kind: repository
intent_digest: sha256:7aaee3b2c820d966ff35e2032c0c2dc238d8fb6c73dc8507a4dca80c4cda2509
intent_input_digest: sha256:cf5de41c08596b2f93dc8ff0c1c2efac4b5fb3d20bca51af2cc2e49865ab7e02
intent_revision: f186cce4ddc466ff5b1eefcac3a1a189c70a54af
by: cwijayasundara
at: 2026-09-09T20:36:00.724Z
digest: sha256:7146aa61da6c8c8c7c1f4cbb72105997b85252becd1b01300761f5373e2a9f0b
approval_version: 2
approval_digest: sha256:6cb592cba6262ba2a49a8893846d5f6ab8f31db751e6e8b3aae19a5484541341
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

**Line cost.** `graph.mjs` was 366 lines of a 4,841-line kernel when this spec was written, and the
lean review names 33% core growth as the standing risk. The expectation this spec set: the ranking
and the pipeline stages stay inside `graph.mjs` and it ends under 550 lines; co-edit derivation,
which is the only part that shells out to git, goes in its own module under 90 lines. A design that
needs more than that is a design to bring back to the human, not to land quietly.

That expectation was reached at step 4 and brought back rather than quietly raised. With the
starter, audit, anchor and co-edit stages landed and the ranking still to come, `graph.mjs` stood
at 558 lines and the kernel at 5,257. The user's decision on 2026-09-09 was to split rather than to
raise: centrality moves whole into `.aidlc/lib/rank.mjs` — the PageRank and the existing `hubs`
body with it — cohesive on its own as "how central is this module", and the same reason co-edit
was split out. The ceilings stand rather than move: `graph.mjs` under 550, `coedit.mjs` under 90,
`rank.mjs` under 100. Splitting is not a way around the number. The number is what forced the split,
and a third module that still does not fit is still a design to bring back.

`rank.mjs`'s figure was itself brought back once. Written as 90 before the module existed, it was
an estimate; the module came in at 105 and trimmed to 99, of which 34 lines are the `why:` comments
the constitution requires. Cutting those to reach 90 would be deleting the reasoning to satisfy a
number, which is the same move as weakening a test to make a build pass. The user raised it to 100
on 2026-09-09 rather than accept that trade. `graph.mjs`'s 550 was not touched, and it is the
figure that mattered: the split brought that module from 558 down to 547, which is what the
ceiling existed to force.

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

## Basis

Superseding decision 1 of the intent, on the user's instruction of 2026-09-09: this change is no
longer gated on a paid local comparison, and carries no spend ceiling of its own.

The reason is that the question the comparison was to answer already has a published answer.
Anthropic's Claude Code cost guidance recommends precise symbol navigation in place of text
search on exactly these grounds — "a single 'go to definition' call replaces what might otherwise
be a grep followed by reading multiple candidate files" — and names unnecessary file reads as a
principal driver of context growth. A property graph with resolved references is that capability.
Spending USD 10 and forty minutes to re-derive a vendor recommendation locally, on a sample small
enough that the earlier four arms saturated at 33 of 33, buys less than it costs.

What does not change is the measurement. B6 still re-runs `pack-bench.mjs` and records the result
whichever way it comes out, against the 5,743-versus-3,436 figure already on record, and
`pack-bench.mjs`'s exit criterion is untouched. Removing a spend gate is not removing
accountability: this change is still measured, just after the fact rather than before it.

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
