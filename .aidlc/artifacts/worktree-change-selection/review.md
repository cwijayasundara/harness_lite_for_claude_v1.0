---
status: draft
---
# Review: worktree-change-selection

Local self-review, 2026-09-08. This is not an independent evaluator or human merge approval.

- B1/B2: the only authority lookup is the explicit Git-worktree-local selection; timestamps
  remain audit data. Real worktrees prove isolation and unrelated backlog non-interference.
- B3: both selected gates must be current and committed before returning a plan. No fallback
  plan is consulted. Existing tests still prove scope refusal and missing proof-file findings.
- B4/B5: unavailable selection returns diagnostic data, preserving refusal instead of triggering
  legacy exception fallback. Branch and detached-HEAD checks precede artifact authority.
- B6: CLI JSON/text, session context and all existing authority readers share artifacts.mjs.
  Sequential driver setup explicitly selects proposals before their simulated approvals.

No unresolved item 1 defect found in local review. Full stop and commit checks passed; see
saved evidence. The change does not authenticate approvals or fix the committed-candidate scope
gap. Paid model campaigns and hosted review were not run. Human PR/merge approval remains pending.
