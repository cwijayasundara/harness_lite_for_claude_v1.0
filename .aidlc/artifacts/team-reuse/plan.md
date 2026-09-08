---
status: draft
---
# Plan: team-reuse

## Approach

Repair the existing installation boundary and add provenance to existing check evidence.
Keep identity equality, actor attribution and authenticated host approval distinct. Validate
through installed product consumers as well as unit regressions.

## Files

- `.aidlc/lib/runtime-identity.mjs`
- `.aidlc/bin/harness`
- `.aidlc/lib/runner.mjs`
- `.aidlc/lib/ledger.mjs`
- `.aidlc/lib/paths.mjs`
- `.aidlc/checks/budget.mjs`
- `.aidlc/policies/review.md`
- `test/`
- `evals/lib/stage.mjs`
- `evals/lib/campaign.mjs`
- `evals/README.md`
- `.github/workflows/harness.yml`
- `README.md`
- `docs/SPDD-TEAM-EVOLUTION-PLAN.md`

## Order

1. Preserve the pre-fix disposable-product reproduction and add failing installation/migration
   regressions covering wrong revision, dirty runtime, absent Git cache and legacy records.
2. Implement deterministic covered-content identity and policy digest; generate shim preflight
   and extend init/doctor, preserving deliberate upgrade and self-development behavior.
3. Add invocation/actor/runtime/policy provenance to runner reports and ledger rows with
   consistency checks; keep execution proof and host review distinctions unchanged.
4. Implement exact-invocation ledger export with explicit missing/legacy evidence handling.
5. Update existing consumer CI and review guidance; execute two fresh local installations
   and reuse the proven product assertion procedure on a second slice using existing staging.
6. Run focused/full checks and clean candidate validation; archive evidence and local review,
   then update delivery F. Leave final human PR/merge approval separate.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | test/install.test.mjs and test/runtime-identity.test.mjs: actual generated shim, env/cache mismatch, modes, symlinks, dirty checkout, exact commit and content |
| B2 | test/runtime-identity.test.mjs: doctor text/JSON, independent roots, policy edits, missing inputs, legacy upgrade and self-host development |
| B3 | test/runtime-identity.test.mjs and existing candidate/trace tests: invocation consistency, actor provenance, unknown actor, runtime/policy mutations and unchanged proof boundaries |
| B4 | test/ledger-export.test.mjs: exact selection, stale last-check, malformed/missing/legacy records, CLI failures, no current-environment backfill; CI recipe exit preservation |
| B5 | team-reuse/post-fix.mjs and post-fix.json: two isolated installations, real product failures/passes and second-slice reuse; full stop/commit and clean candidate reports |

## Gate status

Prepared for concrete spec/plan review. No approval is inferred from the item-6 intake request.
