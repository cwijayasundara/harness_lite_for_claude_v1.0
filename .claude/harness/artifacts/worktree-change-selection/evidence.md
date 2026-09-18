# Worktree change selection evidence

Authorization: user reviewed the draft spec and plan and replied “approved pls continue” in
this conversation on 2026-09-08. The assistant recorded that decision using the existing CLI
with audit label cwijayasundara. This is a conversation authorization, not a claim that the
human invoked the CLI. Proposal commit: 44f5d9b. Recorded approval commit: 4673049.
The Approval status paragraph in the sealed plan describes its original draft state.

Before repair, the ten new worktree-selection tests all failed. The real-worktree case
selected second instead of hyphen-titlecase; the branch-switch case kept authority.
The earlier disposable product reproduction is preserved in reproduction.json.

Implementation and local acceptance complete. No merge approval is claimed here.

## Acceptance coverage

The 12 tests in test/worktree-selection.test.mjs cover two real product worktrees, later
committed approval, unrelated backlog drafts/stale approvals, missing/draft/uncommitted/stale
selected spec and plan, independent restarts, branch and detached-HEAD movement, corrupt and
missing selections, invalid CLI commands, unreadable artifacts, and two sequential simulated
product-driver deliveries. Existing current-change/guard/scope/gate-content/campaign tests were
adapted to select explicitly; their borrowing, proof and stale-approval assertions remain.
The first ten new tests failed before repair; see the pre-fix reproduction for the concrete
product defect. All tests now pass in the full unit suite.

Compatibility: no implicit legacy fallback, even with one change. Selection must be explicit.
The product driver's simulated decisions are tests, not evidence of human approval. Historical
artifact schemas, closure meaning and relation policy were not migrated or rewritten.

## Verification

`node .aidlc/bin/harness check --stage stop`:

```text
PASS  secrets     83ms
PASS  test        18503ms
```

`node .aidlc/bin/harness check --stage commit`:

```text
PASS  secrets     67ms
PASS  test        18203ms
PASS  scope-drift 77ms
PASS  budget      1ms
PASS  tamper      58ms
PASS  arch        28ms
PASS  test_quality 29ms
```

All seven checks passed. The final JSON report
is saved beside this file as commit-check.json. No budget limits or fixture sources changed.
`git diff --check` also passed.

## Remaining boundaries

Item 2's committed-candidate gap remains. The guard remains a workflow heuristic, not a
security sandbox; local metadata does not authenticate people. Existing unrelated-change
relation approval requirements remain for item 4. No paid campaign, deployment, remote
assignment or independent hosted review was performed. Only item 1 was implemented.
