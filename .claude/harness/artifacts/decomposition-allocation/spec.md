---
status: approved
supersedes: a-change-declares-its-relation#B1, a-change-declares-its-relation#B5, a-change-declares-its-relation#B6
extends: compare-native-claude, complete-native-comparisons, pr-candidate-scope, requirement-traceability, worktree-change-selection
source_digest: sha256:b24aead30834cc9fe619f6a2a43ebe7e0fcbe8ebf86c8a39dc4b4467756cd4da
source: docs/SPDD-TEAM-EVOLUTION-PLAN.md
source_revision: 4add89e3741e6a652731c488e68140c78900dc0b
source_kind: repository
intent_digest: sha256:4d49dce321d752d4fcccfb3c03d8bcd1dce31d67a03dee54f993bf1d031609be
intent_input_digest: sha256:a63d8fa8506248798bb43df495864f444c668505dd29ff767b3a36bc4ed573a2
intent_revision: 6145407f1abf402f0a740ab5205cb1b9f71565b8
by: cwijayasundara
at: 2026-09-08T13:33:46.569Z
digest: sha256:458b0b6e847f772458e50cd88b5fd190f0795d92aa584302e93d0547b7feb2d1
approval_version: 2
approval_digest: sha256:b5151b495789af7736768de86a141d9f49c79ec0e39e8bcdb2b45cbfe538ac8f
---
# Spec: decomposition-allocation

## Outcome

Teams inspect bounded child outcomes and coordination needs through the existing status
command without granting execution authority from backlog relationships.

## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| local:D-three-bounded-child-outcomes-and-parent-coverage | B1 |
| local:D-dependencies-cycles-and-shared-interfaces | B2 |
| local:D-overlapping-scopes | B3 |
| local:D-existing-tracker-allocation | B4 |
| local:D-no-unrelated-fake-links | B5 |
| local:D-preserve-A-C-and-history | B6 |

## Observable behaviours

### B1 — child coverage with a complete source inventory

Given three child intents sharing scalar parent, source and source_revision references,
when status is requested, then it groups children by parent and source revision and maps
source criterion IDs through each child's existing Requirements table to behaviour IDs.
For a repository source, an optional Acceptance criteria table (Criterion ID | Criterion)
at the exact source commit supplies the full inventory. Unmapped criteria and unknown
criterion IDs are reported. Differing source revisions remain separate and visible.
Missing, malformed or external inventories produce coverage-unavailable with a reason;
the union of child mappings is never presented as the complete parent inventory.
Draft, stale, legacy and approved children are labelled. Coverage means declared coverage,
never accepted or delivered behavior; closing all children cannot mark the parent complete.

### B2 — delivery dependencies and shared contracts

Given optional comma-separated depends_on slugs in a plan and an optional Dependencies
table (Change | Interface | Revision), when status runs, then it reports prerequisite
edges, absent targets, self-dependencies, cycles and interface revision expectations.
Table targets must appear in depends_on. A revision is an exact Git commit containing
the named repository interface path. Report whether it is an ancestor of checkout HEAD
and whether that interface still matches the required revision; changed, missing or
unavailable interfaces require impact assessment. Approval or closed status alone never
establishes delivery readiness. Dependency findings advise integration and do not switch,
expand or revoke another worktree's execution authority. Malformed declarations are
reported and refused at the declaring plan's approval, not silently ignored.

### B3 — concrete local scope overlaps

Given open plans, when status runs, then it compares their declared Files paths using
the existing ownership semantics, including directory containment. It reports each
colliding pair, the actual scope intersection and each plan's approval state. Draft
scopes are proposals. Closed plans are excluded from active overlap findings.
Findings recommend a shared prerequisite, serialization or an integration owner.
No collision in the local artifact backlog is labelled only as no local overlap;
remote PR and assignment visibility is always explicitly unavailable in this version.
Overlaps are advisory and cannot grant or transfer path ownership.

### B4 — tracker references remain projections

Given optional scalar tracker, assignee, iteration and assignment_observed_at values in
an intent, when status runs, then it displays these with their change and parent and
labels them locally recorded, unverified tracker projections. Missing observation time
is unknown freshness, never current allocation. No remote write or assignment is made.
Both text and JSON status expose coverage, dependencies, overlaps and visibility limits;
requesting one slug still evaluates its relationships against the full local backlog.

### B5 — unrelated changes require no continuity declaration

Given an otherwise approvable independent spec alongside unrelated approved changes,
when approval runs, then no extends or supersedes entry is required for those changes.
Explicit extends and supersedes claims retain target validation and semantic binding.
The existing exact behaviour citation rule and reversal safeguards remain in place.
Guidance distinguishes parent contribution, delivery dependency, continuity and reversal.
Historical artifacts are not rewritten. The extends entries on this preparation are
compatibility declarations for the current approval implementation and are not a new
requirement for unrelated changes after delivery.

### B6 — bounded migration and proof

Given legacy or item-3-bound artifacts, when the change is deployed, then existing
closed/extends/supersedes meanings remain intact except for B5's explicit replacement
of mandatory global continuity declarations. New metadata is optional, strictly parsed
when present, and covered by existing semantic bindings. Editing parent/source criteria,
dependency/interface or allocation inputs makes their own bound approvals stale through
the existing reader; unrelated changes retain authority. Missing metadata conveys unknown
information, not invented approvals. Three child outcomes in a disposable non-harness
product demonstrate coverage gaps, dependencies, cycles, changed interfaces, tracker
projections and scope overlaps. Existing stop and commit checks pass without budget growth.

## Design

Extend artifact readers and the existing status command with a derived local coordination
projection. Use scalar frontmatter and explicit Markdown tables, no YAML engine or new
persistent registry. Parent identity belongs to the versioned source or external tracker.
One source inventory is read from Git; child intents reference it without duplicating it.
Use existing Git helpers for exact interface snapshots and ancestry. Keep deterministic
ordering and actionable errors. Local observations are not an authoritative host view.

## Out of scope

Items 5–6, product truth indexing, automatic decomposition or scheduling, remote tracker
adapters, assignment changes, locking, new controls, extra gates, paid model campaigns,
host configuration, merges and deployment. No claim of semantic conflict detection for
undeclared interfaces or cross-file invariants; those require review and integration tests.

## Safeguards

Preserve independent worktree authority, candidate diff checks, requirement bindings,
proof execution distinctions and host-review limits. No historical approved body edits,
fixture source changes, dependency additions or control-budget increases. Malformed or
incomplete metadata must produce findings without making unrelated execution unavailable.
