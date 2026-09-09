---
status: draft
extends: code-property-graph
---
# Spec: the-index-tracks-the-source

## Outcome

The index describes the current source: not the harness's record of its own past runs, and not a
state that a commit has already moved on from.

## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| user:index-the-source-not-its-history | B1 |
| user:the-graph-never-goes-stale | B2, B3 |

## Observable behaviours

### B1

Given a repository the harness has already run in,
When the index is built,
Then no path the harness itself wrote is indexed as source: recorded comparison and product runs
under `.aidlc/evals/`, and agent worktrees under `.claude/worktrees/`. On this repository that is
451 of 543 modules — 377 recorded comparison runs, 50 worktree copies and 17 product runs against
92 real source modules — so the ranking, the ambiguity list and the map describe the project
rather than copies of its history. A project's own `[graph] exclude` entries keep working and are
additive to these. `.aidlc/artifacts/**` reproduction scripts are source and stay indexed.

### B2

Given a commit that changes no file in the working tree,
When `refresh()` runs,
Then it does not report `clean`: the fingerprint covers the current commit id as well as
discovered paths and their contents, so history-derived edges are recomputed. Under a
content-only fingerprint the co-edit weights `code-property-graph#B4` adds would report identical
before and after a commit that changed them, and nothing in the refresh loop could see it.
Deriving those weights stays bounded work done once per commit rather than once per turn.

### B3

Given an index that is out of date for any reason,
When a caller reads it,
Then it is reported absent rather than served: a fingerprint mismatch makes `load()` return
`null`, `pack.mjs` and the pre-search hook take their existing miss paths and send the caller to
search, and a build's ranking and audit describe exactly the module set that build produced —
because `refresh()` rebuilds whole rather than patching, there is no path that updates modules and
leaves a rank behind. The rebuild time after B1 is recorded, so "fast enough to run every turn"
is a measurement rather than a claim.

## Design

B1 is a constant in `.aidlc/lib/graph.mjs`: the harness's own output roots, unioned with
`cfg.graph.exclude` inside `discover()`. It is not a default in `harness.toml`, because a default
is a value each project may edit away, and a project that edits it away silently re-indexes 377
copies of its own test history. The directories are written by the harness, so the harness is what
knows about them.

B2 adds the commit id to `fingerprint()`. `git rev-parse HEAD` is one cheap call already available
— `changedSymbols` shells out to git in the same module — and a repository with no commits or no
git yields an empty component rather than an error, matching how `code-property-graph#B4` degrades.

B3 is largely an assertion that existing properties survive rather than new code. `refresh()`'s
whole-rebuild is deliberate and stays; the `skipped: 'clean'` path stays, now correctly gated by a
fingerprint that includes history.

The rejected alternative for B1 is adding the paths to this repository's `[graph] exclude`. It is
a smaller diff and it fixes exactly one repository. Every consuming project would inherit the
defect and would have to discover it the way this one did — by building an audit stage and reading
the composition — which is not a reasonable thing to require of them.

The rejected alternative for B2 is a separate freshness stamp for co-edit alone, keyed by HEAD.
It avoids rebuilding the structural graph on a commit that changed no file. It is rejected because
two staleness mechanisms that must agree is the shape of most defects in this repository, and
because after B1 the whole rebuild is cheap enough that the saving is not worth a second concept.

## Out of scope

- Any change to `code-property-graph`'s approved behaviours. This extends that change; it reverses
  nothing in it, so `supersedes:` is empty.
- Incremental rebuild, rank patching, or any change to `refresh()`'s coalescing, locking or
  fail-open behaviour.
- Deleting, pruning or relocating the recorded run directories themselves. They stay exactly where
  they are and remain readable; they simply stop being indexed as source.
- Changing `pack()`'s budget or the pre-search hook's advisory output.
- `[limits]`, skills, hooks, agents and controls.

## Safeguards

- A module that is no longer indexed is still findable: `pack.mjs` and the pre-search hook keep
  their existing miss paths, so the effect of the exclusion is a smaller index, never a confident
  "not found".
- A project's own `[graph] exclude` is unioned with, never replaced by, the harness's list.
- `.aidlc/artifacts/**` scripts stay indexed, so removing run directories does not quietly remove
  hand-written reproduction code with them.
- B2's git component degrades to empty on a repository with no commits, no git, or a shallow
  clone, so the fingerprint never throws where it previously succeeded.
- The `graph_modules` and `graph_symbols` drop is a recapture of `.aidlc/baseline.json`, and the
  record must state that it is a corrected scope rather than a regression — the same discipline
  `a-baseline-measures-what-ships#B5` established. Neither metric is in `RATCHETED`, so no gate
  reads the change as a rise.
