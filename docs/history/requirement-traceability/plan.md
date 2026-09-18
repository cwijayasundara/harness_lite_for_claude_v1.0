---
status: approved
by: cwijayasundara
at: 2026-09-08T12:26:17.858Z
digest: sha256:65de00efd6481eede620ff0f56edfe2dc201bd5a18b84bd7d5ddcc78dcd39ee2
spec_digest: sha256:5083a191e265d1880cbca34cc099944d68cf32f3750172b4c3a81c32e2c60cad
---
# Plan: requirement-traceability

## Approach

Repair approval revision binding and extend existing evidence consumers. Use strict
versioned scalar inputs, explicit historical compatibility and conservative proof
classification. Start with the saved product reproduction. New tests target the
approval bypasses and false evidence claims rather than metadata presence alone.

## Files

- `.aidlc/lib/artifacts.mjs`
- `.aidlc/lib/runner.mjs`
- `.aidlc/lib/normalize.mjs`
- `.aidlc/lib/review.mjs`
- `.aidlc/lib/trace.mjs`
- `.aidlc/bin/harness`
- `.aidlc/templates/intent.md`
- `.aidlc/templates/spec.md`
- `.aidlc/templates/plan.md`
- `.github/workflows/harness.yml`
- `test/`
- `README.md`
- `docs/SPDD-TEAM-EVOLUTION-PLAN.md`

## Order

1. Preserve reproduce.mjs/reproduction.json. Add product-backed regressions and legacy
   migration tests in test/requirement-traceability.test.mjs before changing semantics.
2. Extend artifacts.mjs with strict new binding validation, requirement mappings,
   intent/source revision capture, transitive staleness and downgrade detection.
3. Extend normalize.mjs/runner.mjs with current-run pytest execution observations and
   a derived candidate trace in trace.mjs; preserve existing verdict and ledger behavior.
4. Extend review.mjs/CLI with a read-only GitHub evidence adapter. Verify documented
   host API semantics before coding; test through an injected transport, including
   policy visibility, pagination, API failure and changed-head cases.
5. Update templates, status diagnostics, README and candidate evidence upload as needed.
   Adapt existing approval tests with explicitly simulated new-format or legacy inputs;
   never rewrite approved history or protected fixture sources to make checks pass.
6. Run focused migration/trace/runner/review tests, the full stop and commit stages,
   and a clean base-to-candidate check. Review the diff and save exact evidence,
   compatibility notes and limitations in the delivery record. Do not begin items 4–6.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/requirement-traceability.test.mjs`: committed source and intent bindings, criterion coverage, malformed and missing inputs |
| B2 | `test/requirement-traceability.test.mjs`: metadata/intent edits, dependent plan refusal, unrelated edits and rebase |
| B3 | `test/requirement-traceability.test.mjs`: historical approvals, explicit upgrade, stripped/downgraded binding and migrated artifacts |
| B4 | `test/trace-evidence.test.mjs`: real disposable pytest execution, absent/skipped/failed tests, stale reports and unsupported formats |
| B5 | `test/review.test.mjs`: injected host responses and CLI integration for revision/policy/identity distinctions and unavailable API |
| B6 | reproduction.json, post-fix product evidence, full stop/commit and clean candidate reports, local review and delivery record |

## Gate status

Prepared for review. Spec and plan remain drafts; no approval metadata is manufactured.
