---
status: approved
spec_digest: sha256:f3d9a7b881fe1fd5b4294a93efcacb00dc1b037259dea8e59fe8bce02beb55b0
spec_approval_digest: sha256:03090bab4ed2736a1bb3cbfbdcdf9484fa3c213558eb766ee770b86082dcb28a
by: cwijayasundara
at: 2026-09-08T14:00:26.832Z
digest: sha256:6f187a888d379304ef2c7450cc2791366541df25d2778748cf3b88fd19c292aa
approval_version: 2
approval_digest: sha256:51da8e6df939ad73f70222fcd6d4d23655150013a5e999c9ceedcf4625f48a63
---
# Plan: product-design-context

## Approach

Extend existing navigation commands with an evidence-qualified delivery projection. Preserve
approval-time relationship readers and add an explicitly separate revision-aware context reader.
Reuse existing historical binding, candidate diff, host report and graph/pack machinery.

## Files

- `.aidlc/lib/product-context.mjs`
- `.aidlc/lib/artifacts.mjs`
- `.aidlc/lib/graph.mjs`
- `.aidlc/lib/pack.mjs`
- `.aidlc/lib/map.mjs`
- `.aidlc/lib/review.mjs`
- `.aidlc/bin/harness`
- `.aidlc/templates/review.md`
- `.aidlc/policies/review.md`
- `.aidlc/skills/change-safely/SKILL.md`
- `.aidlc/skills/map/SKILL.md`
- `test/`
- `README.md`
- `docs/SPDD-TEAM-EVOLUTION-PLAN.md`

## Order

1. Preserve reproduction.mjs/reproduction.json and add migration regressions for approval-time
   supersession, closure and history before introducing the separate delivered projection.
2. Implement strict delivery record and report readers, explicit product/catalog commit resolution,
   isolated snapshot validation, reachable historical record discovery and evidence diagnostics.
3. Derive source/behavior/design/proof/file links, delivery qualification and deterministic
   supersession/conflict states without changing execution authority or historical contracts.
4. Extend graph query product and revision-aware pack with text/JSON, snapshot graph reuse,
   bounded context and honest fallbacks; clarify existing status and generated map presentation.
5. Update existing review/navigation guidance and README with concrete delivery record schema,
   evidence capture recipe, revision queries, reversal/refactor/bug distinctions and trust limits.
6. Run the disposable product lifecycle with actual product assertions and simulated decisions;
   run focused tests, stop and commit stages, and a clean base/candidate check. Archive exact
   evidence, local review and delivery record. Stop at item 5 and leave the human merge gate open.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | test/product-context.test.mjs: exact product/catalog commits, dirty files, invalid refs, report identity, host merge versus policy, CLI text/JSON |
| B2 | test/product-context.test.mjs: ancestry, merge-content mismatch, missing/failed evidence, legacy, closed proposals, record history/deletion, unsafe paths |
| B3 | test/product-context.test.mjs: pre/post reversal, chain, competing replacements, cycles, deleted links, unchanged historical bytes |
| B4 | test/product-context.test.mjs: refactor continuity, source/design/proof trace, renamed/deleted files and file/commit fallback; product trial |
| B5 | test/graph.test.mjs, test/pack.test.mjs, test/map.test.mjs: cache deletion, historical snapshot isolation, misses, budgets, coverage and compatibility |
| B6 | test/supersedes.test.mjs, test/worktree-selection.test.mjs, test/requirement-traceability.test.mjs; product post-fix evidence and full stop/commit/candidate reports |

## Gate status

Prepared for review. Spec and plan remain drafts. No approval is inferred from intake or
simulated fixture decisions; implementation begins after the user's concrete gate decisions.
