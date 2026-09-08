---
status: draft
extends: worktree-change-selection, compare-native-claude, complete-native-comparisons
---
# Spec: pr-candidate-scope

## Outcome

A clean PR checkout cannot conceal an out-of-scope change by committing it.

## Observable behaviours

### B1

Given explicit base and candidate revisions and one selected change, checking the
candidate evaluates the complete endpoint diff, including multiple commits. A
committed file outside that change's approved plan fails; an owned file passes.

### B2

Given added, modified, deleted, or renamed paths, every affected path is checked.
Both the old and new names of a rename must be owned. Spaces, tabs, newlines and
shell metacharacters in paths must not truncate paths or execute commands.

### B3

Given a candidate check, missing, malformed or unresolvable revision options,
a candidate different from checkout HEAD, or tracked working-tree changes fail
explicitly. The candidate's selected change must have current committed approvals;
it cannot borrow another plan. Candidate proof files must exist in the candidate
tree; untracked local files cannot satisfy them. Checks do not switch branches or
silently replace the worktree selection.

### B4

Given an ordinary local check without revision options, staged, unstaged and
untracked changes remain checked with existing selected-change gate semantics.
Local rename and deletion scope gaps receive the same path handling repair.

### B5

Given a candidate invocation through the existing check runner, its JSON report,
saved report and ledger identify the resolved base SHA, candidate SHA and change.
Existing diff-based built-in checks that run use that same boundary; Git errors
are errors, never passes. Invalid candidate mode cannot report success because a
chosen stage omitted scope validation.

### B6

Given a pull request, CI checks the PR head candidate against the merge base with
the target revision, using an explicit change reference from the PR description.
A missing or ambiguous reference fails with a remedy. CI preserves revision-bound
scope evidence even on failure. The recipe is documented for consumer repositories.

## Design

Extend harness check with paired --base and --candidate options and optional
--change for invocation-only selection. Candidate mode requires candidate = HEAD
and a clean tracked checkout, avoiding authority read from a different revision.
Untracked files are excluded from candidate evidence; local checks retain them.
Resolve commit arguments using argument-array Git calls and parse path lists with
NUL separators. Use rename-disabled diffs to expose both rename endpoints as
deletion/addition. Share the boundary through runner context with scope and tamper;
reuse existing artifact approval validation. Always include scope in candidate mode.
The explicit base means a two-endpoint diff; CI calculates the PR merge base first.
Use a single `Harness-Change: pr-candidate-scope` line in the PR body for selection.
Pass event values through environment variables, not shell interpolation. CI uses
pull_request without privileged pull_request_target execution or new credentials.

## Out of scope

Items 3–6; host identity authentication; proof of test execution; evaluating historical
candidates without checking them out; scanning every intermediate commit when a change
is reverted before the candidate; changing artifact exemption or relationship policy.

## Safeguards

No additional control, dependency or control-budget increase. Preserve existing local
guard behavior. Revision evidence identifies what was checked, not human approval,
merge, deployment or a security boundary. Do not modify protected fixture sources.
