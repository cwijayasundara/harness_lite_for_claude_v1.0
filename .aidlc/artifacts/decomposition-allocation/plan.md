---
status: approved
spec_digest: sha256:458b0b6e847f772458e50cd88b5fd190f0795d92aa584302e93d0547b7feb2d1
spec_approval_digest: sha256:b5151b495789af7736768de86a141d9f49c79ec0e39e8bcdb2b45cbfe538ac8f
by: cwijayasundara
at: 2026-09-08T13:33:51.327Z
digest: sha256:15e7570f58f7ca734076148e4f7ae0aeef97d92f5b81626056fb8f5b1d9f46fc
approval_version: 2
approval_digest: sha256:ab2f627f4c9a84750d3ab9aa87411e5e1737216392791e2e4b3198ca0ecefa67
---
# Plan: decomposition-allocation

## Approach

Repair the reproduced global relation gate and add a read-only coordination projection to
existing status. Keep relationship parsing separate from execution selection. Use existing
semantic binding and source Git readers; add no control or runtime dependency.

## Files

- `.aidlc/lib/artifacts.mjs`
- `.aidlc/lib/coordination.mjs`
- `.aidlc/bin/harness`
- `.aidlc/templates/intent.md`
- `.aidlc/templates/spec.md`
- `.aidlc/templates/plan.md`
- `.aidlc/skills/intent/SKILL.md`
- `.aidlc/skills/spec/SKILL.md`
- `.aidlc/skills/plan/SKILL.md`
- `test/`
- `README.md`
- `docs/SPDD-TEAM-EVOLUTION-PLAN.md`

## Order

1. Preserve reproduction.mjs/reproduction.json and add migration regressions before changing
   the mandatory global relation rule; retain explicit target and reversal validation.
2. Implement strict optional relationship/table readers and source inventory lookup, using
   item 3 bindings without upgrading historical approvals or changing lifecycle semantics.
3. Derive dependency graph diagnostics, exact interface observations, scope intersections,
   source coverage and locally recorded tracker projections in coordination.mjs.
4. Expose deterministic text/JSON status findings, including slug-filtered queries against
   the full backlog, and explicit missing remote visibility. Keep selection unaffected.
5. Update existing intent/spec/plan guidance and README with a three-child example, shared
   prerequisites, integration ownership and criterion gaps. Preserve the skill control budget.
6. Exercise a disposable product with three child outcomes and genuine local Git revisions;
   label all simulated approvals. Run focused tests, full stop/commit stages and clean
   base/candidate checks. Save evidence, local self-review and delivery record. Stop at item 4.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | test/coordination.test.mjs: three children, source inventory gaps, differing revisions, unknown IDs, external/unavailable source, closed children |
| B2 | test/coordination.test.mjs: missing/self/cyclic dependencies, malformed tables, real Git ancestry and changed/missing interface snapshots |
| B3 | test/coordination.test.mjs: exact and directory overlaps, draft labels, closed exclusion and selected worktree authority |
| B4 | test/coordination.test.mjs: text/JSON CLI, slug filtering, tracker freshness and unavailable remote visibility |
| B5 | test/supersedes.test.mjs: independent approval passes, invalid explicit links and reversal protections remain; saved product reproduction |
| B6 | test/requirement-traceability.test.mjs and test/worktree-selection.test.mjs: migration, metadata staleness and unrelated authority; product evidence and full checks |

## Gate status

Prepared for review. No implementation approval has been recorded for this spec or plan.
