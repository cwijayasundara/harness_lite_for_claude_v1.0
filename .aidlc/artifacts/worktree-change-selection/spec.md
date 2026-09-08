---
status: approved
extends: compare-native-claude, complete-native-comparisons
supersedes: a-diff-belongs-to-one-change#B1, a-draft-is-a-declaration#B1, a-draft-is-a-declaration#B2, a-draft-is-a-declaration#B3, a-draft-is-a-declaration#B4, a-draft-is-a-declaration#B5, an-edited-approval-awaits-its-gate#B1, an-edited-approval-awaits-its-gate#B2, an-edited-approval-awaits-its-gate#B4, an-edited-approval-awaits-its-gate#B5, an-unattended-turn-does-not-end-on-a-question#B1
by: cwijayasundara
at: 2026-09-08T11:03:16.462Z
digest: sha256:ba93bea4f1691857eed10098d9c61fbf96fe57923d722beb9160a653fb80ba18
---
# Spec: worktree-change-selection

## Outcome

One worktree selects one change. Selection never grants approval or borrows another plan.

## Observable behaviours

### B1 — explicit independent selection

Given two real Git worktrees sharing an artifact backlog,
when each runs harness status --change with a different existing open change,
then each persists its own selection, and all execution consumers use that identity.
Approval timestamps never choose authority.

### B2 — unrelated backlog does not govern execution

Given an explicitly selected approved change,
when another intent, draft spec, stale approval or later approval appears,
then the selected scope remains available and unchanged. Pending execution gates concern
only the selected change; status can still show all backlog artifacts.

### B3 — selection grants no approval

Given a selection whose spec or plan is missing, draft, uncommitted or stale,
when product writes are attempted,
then they are refused with the selected slug, failing gate and remedy. Another approved
plan cannot substitute. Altering its approved ownership cannot expand permitted paths.

### B4 — unavailable selection fails safely

Given absent, malformed, missing-target, closed-target or branch-mismatched selection,
when execution is requested,
then no plan governs and status/refusals describe the problem and explicit reselection remedy.
Read-only investigation and artifact drafting remain available.

### B5 — restart and branch handling

Given a valid selection,
when a new process or session starts on the same branch,
then it retains selection. Switching branches or entering detached HEAD requires explicit
reselection; commits on the same branch do not invalidate selection. A detached selection
is bound to its exact HEAD. Returning to the originally bound branch restores that binding
only if its change and approvals still validate there.

### B6 — sequential delivery and shared reporting

Given sequential delivery,
when the engineer selects the next change using harness status --change,
then authority changes only to its own approved scope. Status text, status JSON, session
context, guard, scope sensor and campaign checks agree. Missing selection never falls back
to latest approval. Selection can be cleared explicitly with harness status --clear-change.

## Design

Store a small versioned JSON binding at git rev-parse --absolute-git-dir / aidlc-change.json:
slug plus branch ref, or exact HEAD for detached mode. This location is private to a linked
worktree and survives session restarts without becoming a tracked artifact. Resolve it in
artifacts.mjs; validate syntax and target before opening artifact paths. Write atomically.
Do not use common Git config or repository-wide state. A corrupt or unreadable binding is
an explicit unavailable state, not an exception that can trigger the guard's fail-open path.

Use no implicit compatibility fallback: existing sequential callers select explicitly.
This is a documented workflow compatibility change. Preserve artifact parsing and historical
closed/extends/supersedes meanings. Selection of a draft is permitted for preparation, but
neither intake acceptance nor gate approval is manufactured by selection.

## Out of scope

Items 2–6; full committed candidate scope checks, remote coordination, relation policy repair,
new approval metadata, approval authentication and automatic closure.

## Safeguards

Keep existing gate commands and proof validation. No dependencies, controls, hooks or skills
added. Preserve fixture sources; test in disposable copies. Local scope checking retains its
known committed-diff limitation. No historical approval records are rewritten.
