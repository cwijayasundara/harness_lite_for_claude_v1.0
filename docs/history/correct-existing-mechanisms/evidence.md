# Item 1 acceptance evidence

## Authority and scope

The user's instruction to complete item 1, merge to main and push is recorded in intent.md.
Spec and plan approvals were recorded on that conversation authority, not as independent
human CLI actions. Older approvals were preserved. Scope drift passes.

## Deterministic and hosted verification

All local commit-stage controls pass: secrets, tests, scope drift, budget, tamper,
architecture and test presence. Actionlint 1.7.12 validates the workflow.

Hosted CI passed for reviewer-corrected implementation 6a1cd15:
https://github.com/cwijayasundara/harness_lite_for_claude_v1.0/actions/runs/34047279120
The earlier 74b6b78 run also passed:
https://github.com/cwijayasundara/harness_lite_for_claude_v1.0/actions/runs/34046902036
The unit job includes tests and the graph benchmark; the cost job executes the Python
example's tests before checking its unchanged token thresholds.

Failed hosted runs were diagnosed and corrected, not hidden:
- 34046536830: missing Claude CLI and shallow history in the unit job.
- 34046746920: intermittent copying of unused Git metadata into source snapshots.
The correction installs the required CLI, fetches history, and excludes .git from source-only
snapshots. Tests and token thresholds were not weakened.

## Live model integration

The actual-plugin smoke passed with Claude Code 2.1.263, configured Sonnet generator and
Opus evaluator, reporting USD 0.1853427. Its committed JSON contains the approvals,
explicit candidate/base hashes, findings and outcomes:
.aidlc/evals/smoke/agent-mechanisms.json

The installed plugin executed SessionStart. Read-only planning paused, accepted an external
rejection/correction, and resumed implementation only after driver approvals. Independent
runtime cases passed. A fresh read-only evaluator then found the seeded candidate defect
while the checkout stayed on the good commit.

No hosted model run is claimed: the GitHub repository has no API-key secret. Hosted model
smoke is an explicit dispatch option that fails if requested without credentials.

## Independent implementation review

Three invocation outcomes are distinct:

1. bce7cc0 attempt: timed out, no review file, billing unreported.
2. 74b6b78 completed review: preserved verbatim in `review-initial.md` (the first completed
   review, not the timed-out attempt), USD 1.8742675. It requested three mechanism/guidance/
   billing corrections, implemented in 6a1cd15.
3. 6a1cd15 confirmation: preserved verbatim in `review-confirmation.md`, USD 1.249705. It
   explicitly cleared the prior mechanism findings and requested two documentation-only fixes:
   cite CI for 6a1cd15 rather than its base, and distinguish this archive from the timeout.

Those documentation fixes were checked against the run links and immutable review headers
above. `review.md` is the caller's final disposition, not an altered model transcript. No third
model approval is claimed. The user's explicit merge instruction supplies merge authority.
Non-blocking editorial suggestions do not change the verified mechanism outcomes.

## Remaining program work

Item 3 owns full ledger/service campaigns and isolation for arbitrary-shell agents. Items 2,
4 and 5 own broader guidance simplification, comparisons and pruning. These are not claimed
complete by this focused mechanism acceptance. CODEBASE-MAP.md is excluded from this changeset.
