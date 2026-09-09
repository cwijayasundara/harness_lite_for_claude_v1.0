---
status: approved
spec_digest: sha256:a689ef919659350d8b065253e4e6faab7df8bebb80b93a03ab05aa1239325182
spec_approval_digest: sha256:e9e357e7478a5c91367bf586920a9d2174e18ca9a800f520e065d53f57c1559a
by: cwijayasundara
at: 2026-09-09T17:58:40.718Z
digest: sha256:9212785fc1ac4c2e2e576fc32740c8f700c4a125de82dd071529ee4de27cf702
approval_version: 2
approval_digest: sha256:37cfc241d6f37363f6eafa19bd610432d7488475d04aec69b97b3e7f67b95549
---
# Plan: the-index-tracks-the-source

## Approach

Two small changes in one module, plus a recapture and a record.

B1 is a constant unioned into `discover()`'s exclusions. B2 is one component added to
`fingerprint()`. Neither touches `refresh()`'s coalescing, locking or fail-open behaviour, and
neither adds a concept: the freshness loop already rebuilds whole and already treats a mismatch as
a miss, which is why B3 is mostly assertions that those properties survive rather than new code.

Sequencing matters against `code-property-graph`, which this extends. B1 lands **before** that
change's step 5, because PageRank over 377 copies of a recorded run would rank those copies as the
most central files in the repository and make the SessionStart hubs line worse than the fan-in
metric it replaces. B2 lands **before or with** that change's step 4, because co-edit is the edge
type the current fingerprint cannot see move.

The recapture is the part to get right rather than fast. Excluding 451 modules moves
`graph_modules`, `graph_symbols` and `pack_tokens_p50` in `.aidlc/baseline.json`. None is in
`RATCHETED`, so no gate reads them as a rise, but the record still has to say the scope was
corrected rather than let a reader infer the index shrank by accident.

## Files

- `.aidlc/lib/graph.mjs`
- `test/graph.test.mjs`
- `.aidlc/baseline.json`
- `CODEBASE-MAP.md`
- `docs/IMPROVEMENT-PLAN.md`

## Order

1. Add the failing test first: a staged fixture containing `.aidlc/evals/comparisons/`,
   `.aidlc/evals/products/` and `.claude/worktrees/` subtrees, asserting none of their modules is
   indexed while an `.aidlc/artifacts/` script and the project's own `[graph] exclude` entries
   behave as before. It must fail before step 2 exists. B1.
2. Add the harness output roots to `discover()`'s exclusions in `.aidlc/lib/graph.mjs`, unioned
   with `cfg.graph.exclude` rather than replacing it. B1.
3. Record the composition before and after on this repository — 543 modules to the real source
   count, and the audit's ambiguous count with it — as the evidence B1 is measured by.
4. Add the failing test for the fingerprint: a repository whose working tree is unchanged but
   whose `HEAD` has moved produces a different fingerprint, and `refresh()` therefore does not
   report `clean`. It must fail before step 5 exists. B2.
5. Add the commit id to `fingerprint()` in `.aidlc/lib/graph.mjs`, degrading to an empty component
   where there is no git, no commit, or a shallow clone. B2.
6. Assert B3's three properties hold together: `load()` still returns `null` on a mismatch;
   `pack.mjs` and the pre-search hook still take their miss paths; and a build's `audit` and
   ranking describe the same module set that build produced.
7. Measure and record the full rebuild time after step 2, against the 853 ms currently measured at
   543 modules, so "cheap enough to run every turn" is a number. B3.
8. `harness baseline capture`, and regenerate `CODEBASE-MAP.md`.
9. Record in `docs/IMPROVEMENT-PLAN.md`: the composition finding, the corrected scope, the
   rebuild time, and that the `graph_modules` drop is a corrected scope rather than a regression.
10. `harness check --stage commit`, and paste the output.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/graph.test.mjs` — a fixture carrying `.aidlc/evals/comparisons/`, `.aidlc/evals/products/` and `.claude/worktrees/` subtrees indexes none of them; an `.aidlc/artifacts/` script is still indexed; a project's own `[graph] exclude` entry is still honoured alongside the harness's. Written failing at step 1. Plus the before-and-after module composition on this repository, recorded at step 3. |
| B2 | `test/graph.test.mjs` — two fingerprints taken across a commit that changed no working-tree file differ, and `refresh()` does not report `clean` across it; a directory with no git yields a fingerprint rather than an error. Written failing at step 4. |
| B3 | `test/graph.test.mjs` — a fingerprint mismatch makes `load()` return `null`; `pack` on a symbol in an unindexed path returns a miss that names search rather than reporting absence; a build's `audit.ambiguous` names only modules present in that same build's `modules`. Plus the rebuild time recorded at step 7 as runtime evidence. |

`test/graph.test.mjs` is `node:test`, so these are file-and-test-name rows rather than pytest node
ids. B1's and B3's second halves are recorded measurements a reviewer reads, not assertions a test
grades.

## Coordination

This change has no `depends_on` and declares no `## Dependencies` table. It `extends:`
`code-property-graph` in its spec, which is a statement of relation rather than a delivery
prerequisite: nothing here waits on that change to land, and its steps 1 and 2 are already
committed at `e247431` and `e058fb8`.

The ordering runs the other way. `code-property-graph`'s step 5 should not land before this
change's step 2, because ranking the harness's own output would make the hubs line worse than the
metric it replaces; and its step 4 wants this change's step 5, because co-edit is the edge type the
current fingerprint cannot see move. Both are sequencing notes for whoever executes them, not
gates the tooling enforces.

`.aidlc/lib/graph.mjs`, `test/graph.test.mjs`, `CODEBASE-MAP.md` and `docs/IMPROVEMENT-PLAN.md`
are all named in `code-property-graph`'s `## Files` too, and `.aidlc/baseline.json` in
`a-baseline-measures-what-ships`'s. The overlaps are real and were accepted by the user on
2026-09-09; serialization is the agreed handling, and the two graph changes are executed by the
same worker in the order above rather than concurrently.
