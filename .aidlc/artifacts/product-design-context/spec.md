---
status: approved
extends: requirement-traceability, decomposition-allocation
source_digest: sha256:71eed60ee43efe80c5b4dd9789ae0ea66146af9b4c6217b40d67e81afc43d27b
source: docs/SPDD-TEAM-EVOLUTION-PLAN.md
source_revision: c10e2b5fe7e1242bc5feb827df664517f236a8e5
source_kind: repository
intent_digest: sha256:7ee6cd2a2df876ce3ba34335c7208ff418102c9a4c8225d10dc947e1baf8319e
intent_input_digest: sha256:a25bbcf11dd8470638b28e1c459b07f2d8982d1a45c9b783196ad31aba0cc8fe
intent_revision: 2120ec469c3a0b07b84eca82a02424623f8d0654
by: cwijayasundara
at: 2026-09-08T14:00:26.524Z
digest: sha256:f3d9a7b881fe1fd5b4294a93efcacb00dc1b037259dea8e59fe8bce02beb55b0
approval_version: 2
approval_digest: sha256:03090bab4ed2736a1bb3cbfbdcdf9484fa3c213558eb766ee770b86082dcb28a
---
# Spec: product-design-context

## Outcome

Retrieve bounded product and design context at a named repository revision, derived from
recorded deliveries with traceable history and explicit uncertainty.

## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| local:E-revision-specific-delivered-view | B1, B2 |
| local:E-rule-reversal-and-refactor-source-trace | B3, B4 |
| local:E-deleted-cache-rebuild-and-honest-misses | B5 |
| local:E-preserve-history-and-authority | B6 |

## Observable behaviours

### B1 — explicit revision and delivery evidence boundary

Given a repository, when `harness graph query product --revision <ref>` runs, then resolve
and report the requested exact commit. A separate `--records <ref>` selects the committed
evidence catalog, defaulting to HEAD and always reported as an exact commit. This allows
records captured after a merge to describe an earlier product revision. Uncommitted files
cannot change either snapshot. Invalid refs fail with a remedy; incomplete history or objects
report unavailable context rather than an empty complete product. Text and `--json` expose
the same states. The view describes recorded repository integration, never deployed/flag-active
behavior, accepted parent outcomes or newly granted write authority.

Delivery records live beside the change as versioned delivery.json files. Each record references
the exact base/candidate/merge commits, repository/PR identity, and committed candidate-check
and host-review report paths. Reuse item 3's report shapes. Resolve report paths at the catalog
snapshot and artifact/source/proof inputs at the recorded candidate, retaining exact blob or
commit references. Reject malformed, inconsistent or missing identities. Require a recorded
host MERGED observation and merge ancestry to the requested product revision before classifying
an entry as recorded-delivered. Approval and closure alone never establish delivery. Preserve
host policy assessment independently: a host merge observation does not manufacture verified
review. All local report provenance remains explicitly unsigned; simulated transport stays
simulated, including in product trials. No host calls or writes occur during a context query.

### B2 — evidence-qualified projection and migration

Given recorded deliveries, when deriving the view, then validate candidate-bound spec/plan
inputs using existing versioned bindings and compare the candidate's changed product paths
with their merge snapshots, including modes, deletions and rename endpoints. A conflict-resolved
merge that differs requires fresh evidence for the integrated snapshot; it cannot silently
inherit candidate proof. Non-ancestor merges remain not-delivered-at-revision. Missing checks,
failed checks, unexecuted proof, legacy/unbound approvals and unavailable host policy retain
separate visible states; no suite pass or path presence becomes behavior proof.

Legacy changes without delivery records remain delivery-unknown. Closing an unmerged change
removes execution authority as before, but does not retire delivered behavior. Canceled proposals
do not replace anything. Read committed record history reachable from the selected catalog
revision so deletion or conflicting edits of a record are diagnosed rather than silently erasing
history. Ambiguous record identities cannot establish a unique effective replacement. Future
records from other branches or beyond the selected catalog revision are excluded.

### B3 — delivered reversal with deterministic conflicts

Given an original delivered rule and a later approved superseding proposal, when requesting the
original revision, then show the original rule and proposed replacement separately. After the
replacement's recorded integration, show the new rule as effective and retain the original source,
behavior and delivery links as historical. Read semantic links from bound delivery snapshots;
editing or deleting today's spec cannot rewrite the historical relationship. Preserve behavior
IDs. Cycles, missing targets and competing replacements are explicit unresolved findings, never
resolved by approval timestamp or slug order. A later delivered replacement that explicitly
supersedes the competing behaviors can resolve the conflict. Diagnostic uncertainty must not
present one alternative as uniquely established product truth.

Keep the existing supersededBy reader as the approval-time declaration projection used by
legacy consumers. Label status output as approved/proposed supersession and point to the
revision-specific product query; do not silently change its API or execution semantics.

### B4 — refactor and relevant design context

Given a delivered behavior-preserving refactor with an extends link, reviewed Design content,
updated file/architecture references and preserved behavior tests, when retrieving its context,
then retain the original behavior and source chain while exposing the new design record and
its delivery/proof observations. Supersedes alone retires behavior; extends is continuity, not
an implicit replacement or dependency. Links include source criterion, behavior, Design section,
plan Files, proof rows, candidate and merge identity. Code links use file/commit fallbacks when
symbols disappear or files move. No per-function requirement mapping or semantic equivalence
is inferred from graph edges, path ownership, passing tests or matching Git blobs.

### B5 — bounded graph and pack integration with honest fallback

Given `harness pack <symbol-or-path> --revision <ref> [--records <ref>]`, when context is
requested, then use the same exact-revision projection and structural snapshot, append relevant
artifact references within the existing token budget, and name omitted context. Do not mix a
working-tree graph with a historical product view. Reuse existing graph extraction and ensure
behavior against disposable snapshots; do not mutate the user's checkout or tracked map.
A deleted graph cache rebuilds. Missing/unsupported symbols, uncovered legacy areas, extraction
failures and unavailable delivery context supply explicit limitations and targeted source-search
or Git snapshot commands. Graph availability is never an approval gate. Existing pack behavior
without revision options remains usable. The generated map explains structural coverage and
points to the revision-specific query without claiming structural facts are reviewed design.

### B6 — preservation, review guidance and product proof

Given existing artifacts and selected worktrees, when deploying this change, then retain all
historical approved bodies and meanings of closed, extends and supersedes in approval/guard
consumers. Add migration tests before altering presentation. Drafts and delivery records grant
no execution authority. Malformed context metadata cannot block unrelated selected work.
Review guidance distinguishes an authorized rule change, a behavior-preserving refactor and
an implementation bug; correcting a bug must not rewrite the requirement to match it.

A disposable existing product demonstrates an original rule, unmerged reversal, integrated
reversal and refactor with real Git revisions and executed product assertions. Simulated gate
and host decisions are labelled. Tests cover cache removal, missing graph entries, conflicting
replacements, record/link deletion, incomplete evidence and historical queries. Run full stop
and commit stages plus a clean candidate check, save evidence and update item 5's delivery record.

## Design

Add a rebuildable, on-demand delivery index in .aidlc/lib/product-context.mjs, consumed by
existing graph query and optional revision-aware pack paths. Use strict JSON for delivery
records and existing scalar/table parsers for contracts. These are per-change evidence links,
not a new global registry. Keep catalog time separate from product revision time. Evaluate
historical artifacts in isolated Git snapshots with existing binding readers; no branch switch
or worktree selection change. Reuse the shared diff reader and existing graph/pack budget logic.
Read only reachable catalog history, retain immutable snapshot references and report conflicts.
No graph database, embeddings, new control, skill or hook is required.

## Out of scope

Item 6 runtime/policy identity and organization-wide evidence export; automatic scheduling;
tracker integration; host configuration or writes; live hosted acceptance; deployment and
feature-flag state; semantic verification of arbitrary code changes; automatic requirement sync;
rewriting old approvals; paid model campaigns; remote merge or deployment.

## Safeguards

Retain independent worktree authority, committed candidate scope, semantic input bindings,
execution-proof distinctions and host-review limits. Bound snapshot/report reads; reject path
traversal, unsafe Git arguments and symlink escapes. Missing metadata is unknown, not invented
approval. No control-budget increase, dependencies or changes to fixture source directories.
