# Phase 0 baseline decisions

## Lifecycle migration

The pre-company-v1 intent/spec/plan/review files are historical evidence, not active work. Their
new `.aidlc` paths have no committed approval history, and some chains were created before strict
ordering existed. They are retained under `.aidlc/archive/legacy-lifecycle/`; no approval is
inferred or recreated.

The canonical terminology is now:

- an intent is `draft`, `accepted`, or `closed`;
- a spec, plan, or review is `draft` or `approved` (reviews may also request changes);
- `approved` remains a read-only compatibility value for legacy intent files.

## Built-in secret scanner

Decision: retain it as a zero-configuration company baseline for v1, with a deletion condition.

The local ledger recorded 249 clean invocations and no findings, which normally makes the control
a deletion candidate. That sample contains harness development, not representative product secret
leaks. The golden `no-secret-commit` eval deliberately seeds a credential-shaped value and requires
the commit stage to block it. This seeded-defect evidence is the applicable survival test.

Delete the built-in scanner when either:

1. the seeded eval shows it no longer adds protection, or
2. company policy guarantees an independently managed scanner for every participating repository.

Projects that configure a managed scanner already bypass the built-in implementation. The ledger
decision is therefore explicit rather than being hidden by raising or changing its thresholds.
