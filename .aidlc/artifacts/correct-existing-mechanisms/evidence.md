# Item 1 acceptance evidence

## Authority and scope

The user's instruction to complete item 1, merge to main and push is recorded in intent.md.
Spec and plan approvals were recorded on that conversation authority, not as independent
human CLI actions. Older approvals were preserved. Scope drift passes.

## Deterministic and hosted verification

All local commit-stage controls pass: secrets, tests, scope drift, budget, tamper,
architecture and test presence. Actionlint 1.7.12 validates the workflow.

Hosted CI passed for implementation 74b6b78:
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

The initial bce7cc0 review timed out before returning findings. It is incomplete, not approval;
usage for that attempt is unreported. The corrected candidate review is recorded separately
in review.md. That review returned changes-requested (USD 1.8742675). The repair distinguishes
the supplementary native agent from the authoritative standalone review path, removes the
remaining stale bypass guidance and corrects missing billing data to null. It also removes dead
imports/return data, corrects the shell-guard message, explains duplicate push/PR CI runs and
labels the overwritten early smoke result as conversational history. A focused confirmation
review follows these corrections.

## Remaining program work

Item 3 owns full ledger/service campaigns and isolation for arbitrary-shell agents. Items 2,
4 and 5 own broader guidance simplification, comparisons and pruning. These are not claimed
complete by this focused mechanism acceptance. The pre-existing CODEBASE-MAP.md edit is
preserved locally and excluded from the commits.
