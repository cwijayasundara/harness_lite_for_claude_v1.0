---
status: approved
spec_digest: sha256:75bd992e3e16fe16b9ecc59b450c0503593f4d91987473a9ee6dd28485881271
spec_approval_digest: sha256:573d1c40d5c8762229b1687a8ce02d07ca34b2da275636153663c6f653da4204
by: cwijayasundara
at: 2026-09-09T16:18:35.966Z
digest: sha256:2f5c20a91659dbc6c41a1d03b2c0d1dd72a059816b418abdd3b1b771e2b0c582
approval_version: 2
approval_digest: sha256:85cb17dd3ab372211ae195a4d399ade7925cdf88bffc5573ddbf8611485fb3df
---
# Plan: code-property-graph

## Approach

Four stages, added in the order they run, each landing with its own proof before the next exists.

The largest risk is not any single stage but the shape change underneath them: today's index
stores edges implicitly in `raw_imports` and `symbols`, and every consumer reads those fields.
So the starter stage emits an explicit typed edge list **alongside** the existing fields rather
than replacing them, and `query()`'s existing questions keep reading what they read today. That
keeps `pack.mjs`, `map.mjs`, `baseline.mjs` and the pre-search hook working unchanged through
every intermediate commit, and confines the risk to the new questions. The old fields are removed
only if a later change proves nothing reads them; this change does not remove them.

Anchoring uses the resolved `import` edges already computed at `graph.mjs:223` — a call to
`format` in a module importing one of the two definers resolves to that one. No type inference,
no new parser. Where the module imports both or neither, the reference stays ambiguous and says
so, which is B3's second half and the part that distinguishes this from guessing.

PageRank replaces the body of `query(g, 'hubs')` and nothing else, so the SessionStart hubs line,
`map.mjs` and `baseline.mjs`'s pack sampling receive a better ordering without changing a call.
Co-edit ranks separately, over its own edge set, and is never blended in.

Co-edit derivation is the only part that shells out to `git`, so it lives in its own module and
returns an empty edge set on any failure — no history, a shallow clone, a `git` that is not there.
B4's degradation rule is a `try`/empty, not a feature flag.

Sequencing against `a-baseline-measures-what-ships`: that change makes the SessionStart payload
measured and gated, and this one changes what the hubs line inside that payload says. This change
lands second. That ordering is now satisfied — `a-baseline-measures-what-ships` landed at
`76b37ebf`, `session_context_tokens` is recorded at 649 and `[stages] commit` runs the ratchet, so
any movement this change causes in the payload is attributable to it and will be caught by a gate
rather than discovered later.

No spend ceiling and no paid precondition, per the spec's `## Basis`. The accountability is
B6: the benchmark runs after the pipeline lands and its figure is recorded whichever way it comes
out, against the 5,743-versus-3,436 result already on record.

## Files

- `.aidlc/lib/graph.mjs`
- `.aidlc/lib/coedit.mjs`
- `.aidlc/lib/pack.mjs`
- `test/graph.test.mjs`
- `evals/bench/pack-bench.mjs`
- `CODEBASE-MAP.md`
- `docs/IMPROVEMENT-PLAN.md`

## Order

1. **Starter graph.** In `.aidlc/lib/graph.mjs`, emit an explicit typed edge list — `import` and
   `call` — from the existing per-module parse, additive to `raw_imports` and `symbols`. Bump
   `GRAPH_VERSION` from 4. Existing `query()` questions untouched.
2. **Audit and deduplicate.** Add the stage that walks the edge list once: unresolved imports
   recorded rather than dropped at today's `filter(Boolean)`, symbol names defined in more than
   one module recorded as ambiguous, duplicate edges collapsed. Store the report beside the graph
   and expose it through `harness graph query`. B2.
3. **Anchor.** Resolve each call reference to one definition using the referencing module's
   resolved `import` edges; leave it ambiguous and say so where that cannot decide. Add the
   failing test against `evals/fixtures/retrieval-app` first — `format` currently returns two
   equal candidates, and that assertion must fail before this step exists. B3.
4. **Co-edit.** Add `.aidlc/lib/coedit.mjs`: `git log --name-only` over a bounded commit window,
   pair counts per commit, commits touching an implausibly large number of files contributing
   nothing. Returns an empty set on any git failure. Wire it as the third edge type. B4.
5. **PageRank.** Replace the fan-in/fan-out body of `query(g, 'hubs')` with power iteration —
   uniform initial distribution, damping 0.85, dangling mass redistributed uniformly, stated
   convergence tolerance and iteration cap as named constants. Run it a second time over the
   co-edit edge set, reported separately. B5.
6. Name the three edge types in `query()` so a caller can request one and receive only edges of
   that type, and so every answer names the edge type that produced it. B1.
7. Re-run `node evals/bench/pack-bench.mjs` and write the pack, bounded-`rg` and recall figures
   into `docs/IMPROVEMENT-PLAN.md` against the recorded 5,743-versus-3,436 result, whichever way
   it comes out. B6.
8. Regenerate `CODEBASE-MAP.md`, which the Stop hook rewrites when the ranking changes the hubs.
9. Check the line-cost expectation: `graph.mjs` under 550 lines, `coedit.mjs` under 90. If either
   is exceeded, stop and bring the design back rather than landing it.
10. `harness check --stage commit`, and paste the output.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/graph.test.mjs` — the built index exposes `import`, `call` and `co-edit` as named edge types; a query for one type returns only edges of that type; each answer carries the type that produced it. Plus assertions that `callers`, `calls`, `cycles` and `changed-since` return what they return today. |
| B2 | `test/graph.test.mjs` — a fixture with a deliberately unresolvable import reports it as unresolved rather than dropping it; a fixture with one symbol name in two modules reports it as ambiguous; a duplicated edge appears once. Counts and the enumerable list are both asserted. |
| B3 | `test/graph.test.mjs` against `evals/fixtures/retrieval-app` — resolving `format` from a call site in a module importing one definer names that one definition and reports the ambiguity; from a module importing both, the answer says it cannot decide and returns the candidates. Written failing at step 4. |
| B4 | `test/graph.test.mjs` — on this repository the `co-edit` edge between `test/guard.test.mjs` and `test/lifecycle-cli.test.mjs` exists with a weight reflecting repeated co-change, and no `import` or `call` edge joins them. A second case builds against a directory with no git history and asserts an empty co-edit set, a successful build, and every other query unchanged. |
| B5 | `test/graph.test.mjs` — on a hand-built graph whose PageRank ordering differs from its degree ordering, `query(g, 'hubs')` returns the PageRank ordering; iteration converges within the stated cap; the co-edit ranking is returned separately and no call returns a blended score. |
| B6 | `node evals/bench/pack-bench.mjs` output, recorded in `docs/IMPROVEMENT-PLAN.md` at step 8 with the date. Runtime evidence, not an assertion — the benchmark's own `recall >= 0.9` gate still passes or fails the run, but whether the token figure improved is a number a reviewer reads, not a test that grades it. |

`test/graph.test.mjs` is `node:test`, so these rows are file-and-test-name rather than pytest node
ids. B6's row is a recorded measurement and a document paragraph; no test decides whether the
result justifies the change, which is the point of keeping `pack-bench.mjs`'s exit criterion
outside this change's control.

## Coordination

This change has no `depends_on` and declares no `## Dependencies` table: it waits on nothing. The
former dependency on `graph-first-versus-grep-first` producing a comparison outcome was removed on
the user's instruction of 2026-09-09, along with the spend ceiling that came with it; the spec's
`## Basis` section records why. That change still owns the comparison tooling, and running it
later remains possible — this change simply no longer blocks on it.

`docs/IMPROVEMENT-PLAN.md` is named in that change's `## Files` too, and in
`a-baseline-measures-what-ships`'s. All three append rather than rewrite each other's rows;
serialization is the agreed handling and the user accepted the overlap on 2026-09-09.

`CODEBASE-MAP.md` is regenerated by the Stop hook rather than hand-edited, so its appearance here
declares that this change causes it to change, not that anyone writes it.

`.aidlc/lib/pack.mjs` is named because anchoring may let `pack()` select a resolved definition
instead of every same-named candidate. Its token budget, selection order and output shape are out
of scope per the spec; if step 4 turns out not to require a change there, the file is left alone.
