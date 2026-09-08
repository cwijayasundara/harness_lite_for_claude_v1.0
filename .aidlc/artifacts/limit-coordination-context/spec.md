---
status: draft
extends: graph-first-retrieval, decomposition-allocation, product-design-context
source: docs/IMPROVEMENT-PLAN.md
source_revision: a4118f5421454ba90e6e4388291fc92dd87b68c6
parent: lean-review-coordination
---
# Spec: limit-coordination-context

## Outcome

Coordination and revision-specific product context stay limited to the
needs already demonstrated by items D and E. Daily inspection uses tracker
links and targeted Git reads. Status does not become a delivery dashboard,
and nothing here schedules work or assigns owners.

## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| local:limit-to-demonstrated-needs | B1, B2, B3 |
| local:prefer-tracker-and-git-reads | B4 |
| local:no-scheduler-or-assignment-authority | B5 |

## Observable behaviours

### B1

Given the existing coordination projection,
When status or `coordination()` runs,
Then it still reports declared parent coverage, `depends_on` edges,
interface snapshots, local Files overlaps, and optional tracker / assignee /
iteration / `assignment_observed_at` fields as locally recorded, unverified
projections. Those findings never select a change, transfer write scope, or
certify remote assignment or integration. Unrelated specs still need no
`extends` or `supersedes`. Remote PR and assignment visibility remains
explicitly unavailable.

### B2

Given a worktree with a selected open change,
When `harness status` or `harness status --json` runs without a slug
argument,
Then the coordination view is that change's slice, still computed against
the full local backlog (so overlaps and prerequisites with other changes
remain visible for the selected change). Passing `status <slug>` still
selects that slice. With no selection and no slug, the full local
coordination view remains available. Coordination output never grants
execution authority.

### B3

Given recorded deliveries or an approved but unmerged proposal,
When `harness graph query product --revision <commit>` runs,
Then pending approval and closure still do not count as delivered
integration. The command still requires an exact revision, still names
`git show` / `git grep` as the fallback for unmodeled or unavailable
context, and still performs no network calls. `pack --revision` remains
callable and does not gain new query types, snapshot limits, or delivery
fields. No new `delivery.json` keys are added.

### B4

Given canonical instructions, README coordination/product sections, intent
and plan skills, the map skill, and review policy,
When an engineer or agent needs allocation or revision-specific product
context,
Then those surfaces say: change assignments in the existing tracker and
record the tracker URL; inspect source at a revision with `git show
<rev>:<path>` and `git grep`; use `graph query product` only when delivery
records already exist. They do not present `pack --revision` or a local
assignee field as a delivery platform or assignment authority. The lean
review row for coordination records this limit: demonstrated D/E needs
kept, tracker links and targeted Git reads preferred, no scheduler or new
assignment authority, no platform expansion.

### B5

Given the harness CLI, registry limits, and plugin inventory,
When this change lands,
Then there is no `schedule`, `assign`, or remote-tracker write verb. Optional
intent assignment fields remain projections. No production skill, agent,
hook binding, or `[limits]` increase is added. Approved D/E artefact bodies
are not rewritten.

## Design

Keep `.aidlc/lib/coordination.mjs` and `.aidlc/lib/product-context.mjs` as
the demonstrated readers. The usage repair is: pass the selected change
into the existing coordination filter from `status` when no slug is given,
and steer humans and agents to tracker URLs plus Git reads.

The rejected alternative is deleting `delivery.json`, product query, or
revision packing in this change. Those mechanisms have product
reproductions; the lean review said to limit them, not to run a removal
experiment without a later comparison. Expanding them into scheduling,
remote assignment, or a thicker snapshot platform is also rejected.

## Out of scope

- Removing product query, `delivery.json`, or `pack --revision`.
- Fetching GitHub PRs or tracker assignments.
- A scheduler, sprint board, or assignment command.
- Changing host merge policy or review verification.
- Graph feature expansion (owned by `graph-first-retrieval`).
- Rewriting historical approvals or closing other open changes.
- Paid product trials.

## Safeguards

- Coordination remains advisory; selection and plan Files still own writes.
- Product query still cannot treat approval as merge.
- Control budget stays at registry `[limits]`.
- Existing D/E tests that pass a slug to status keep their meaning.
- Simulated tracker fields stay labelled unverified.
