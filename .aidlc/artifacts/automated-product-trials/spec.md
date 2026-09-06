---
status: approved
extends: correct-existing-mechanisms, close-the-harness
supersedes: one-integration-test#B2, one-integration-test#B3, one-integration-test#B4, one-integration-test#B5, one-integration-test#B6, one-integration-test#B7, one-integration-test#B8
by: cwijayasundara (conversation approval, recorded by Codex)
at: 2026-09-06T20:22:20.515Z
digest: sha256:50054c78e72d3329e1c909f6e92f626a0cb65fdc56176321856a8c6c71d9ca2e
---
# Spec: automated-product-trials

## Outcome
One existing eval runner executes two bounded unattended product campaigns with independently
verified products and retained evidence, rather than transcript praise or required test names.

### B1
Given a product trial, when the actual CLI runs, then its container sees only the disposable
product, sanitized read-only plugin and session home. Private assertions, future requirements,
parent repository, Docker socket and external approval receipts are not mounted. Planning
cannot write product source, and implementation cannot rewrite approval artifacts or Git metadata.
### B2
Given a requirement, when planning and implementation run, then the external driver supplies
labelled simulated decisions through ordinary committed approvals. Missing, rejected, fabricated
or stale receipts prevent implementation. Actual plugin loading, pause, correction and resumed
or fresh sessions are recorded. There is no agent self-approval exception.
### B3
Given the existing ledger, when its campaign runs, then characterization, partial payments,
overdue reversal, storage refactor and current documentation preserve independently tested
public behaviour and untouched unrelated code. Superseded requirements are linked explicitly.
### B4
Given an empty service, when its campaign runs, then creation, validation, persistence,
requirement change, reproduced defect repair and process restart pass external HTTP checks,
including persisted state and errors. Operational failure produces an incident and new intent.
### B5
Given adversarial boundaries and failures, when deterministic and live trials run, then missing
tools, stale approval, external rename, seeded review defect and repair are exercised. Product
code executes separately from private assertions. Runtime assertions reject no-op and seeded
faulty products. Local disposable deployment is the only deployment target.
### B6
Given any trial outcome, when it finishes or fails, then evidence retains phase results,
approvals, revisions, model/CLI metadata, cost or missing-cost status, timeout/budget incompletes,
and replayable product snapshots. No incomplete attempt disappears or counts as passing.

## Design and safeguards
Extend evals/run.mjs and its existing stage, invoker, campaign and assertion modules. Put
product scenario data in evals/products.json, distinct from the inexpensive golden tasks.
Use Docker with a pinned CLI, restricted mounts, no privileges, and separate network-disabled
product processes. The parent owns all private expectations and approval receipts. Use the
configured capable generator and independent evaluator; never silently substitute models.
No new production skills, roles, hook bindings or control budgets. Simulated approvals prove
protocol only. Retain bounded retries and explicit spend ceilings. Full model/graph comparisons
and general production deployment remain outside this change.
