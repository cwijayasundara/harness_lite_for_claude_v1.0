---
status: draft
extends: pr-candidate-scope, worktree-change-selection, compare-native-claude, complete-native-comparisons
---
# Spec: requirement-traceability

## Outcome

A reviewer can trace a candidate's behaviour to the requirement revision interpreted,
the approval inputs reviewed and the checks actually observed at that candidate.

## Observable behaviours

### B1

New spec approvals bind the exact committed intent content and its scalar source and
source_revision references. A repository source resolves to committed content at the
named revision; external sources retain an explicit externally supplied revision label
and are reported as externally asserted, never remotely verified by digest alone.
Missing or malformed required references prevent a new binding, even with --anyway.
The spec has a Requirements table mapping source criterion IDs to its numbered B IDs.
Unknown behaviours, duplicate ambiguous mappings and missing behaviour coverage are
reported before approval. A source with no published criterion IDs may use explicit
local criterion labels, identified as such in the table.

### B2

New approvals use a versioned canonical digest of body and semantic scalar metadata,
including source, source_revision, extends and supersedes. Audit fields and the digest
itself are excluded. Plans bind the approved spec's complete input digest. Editing a
bound intent or consequential relationship invalidates the spec and dependent plan;
status, guard and candidate checking agree. Unsupported nested/duplicate metadata and
unknown digest versions cannot silently grant new authority. Intent corrections require
impact review through spec/plan reapproval; no extra gate is introduced. Byte-identical
inputs remain valid after a rebase; unrelated changes never invalidate this change.

### B3

Existing body-only and migrated records retain their documented legacy meanings and
remain readable without rewriting history or inventing approval. Status and evidence
label them legacy/unbound, never fully traceable. Upgrading requires an explicit new
approval with current required inputs. Removing or downgrading a recorded new binding
cannot silently recover legacy execution authority; validate against committed history.
No changes to the meaning of closed, extends or supersedes are included in this item.

### B4

Candidate check evidence joins source criteria to change#B IDs, verbatim proof rows,
approval digests and resolved base/candidate SHAs. It records the command, outcome and
observed test identifiers from the current invocation. Initially support pytest JSON
node IDs already consumed by the runner. Exact file::identifier matches can establish
execution; skipped, failed, absent, malformed, ambiguous or unsupported results cannot
become passed proof. File-only/prose rows and unsupported result formats are explicitly
unverified. Suite success and test-file presence alone do not establish behaviour proof.
No stale on-disk report is reused. Existing fast checks remain usable and visibly report
proof as not executed. Local dirty runs cannot masquerade as clean candidate evidence.

### B5

The existing review command can collect GitHub PR evidence read-only through the
authenticated host API, separately from model review. Reports bind repository, PR,
observed head SHA, review IDs, reviewer identities, review states and host review decision
to the requested candidate. They distinguish a host-reported approval satisfying the
host's available review policy from an individual approval, a local --by audit label,
a model recommendation and user-supplied unverified data. Mismatched heads, dismissed
or stale reviews, changes requested, unavailable policy and API failures never become
verified host approval. Missing credentials produce an explicit unavailable result.
Merge/release identity is recorded only if the host supplies it; candidate approval
never implies merge, deployment or effective product behaviour. Host merge controls
remain authoritative; this adapter grants no local write or merge permission.

### B6

A disposable existing-product trial demonstrates a requirement correction and semantic
metadata edit becoming stale under the new binding, followed by explicitly simulated
reapproval and revision-bound executed proof. Negative trials prove a present but
unexecuted test and a skipped test never count as passed evidence. Deterministic host
fixtures cover valid, stale, dismissed, mismatched and unavailable review states and
are labelled simulations. Full stop and relevant commit checks pass; evidence records
what ran and distinguishes local verification from hosted CI/review.

## Design

Keep the scalar frontmatter parser; validate newly bound artifacts strictly rather than
introducing YAML. Retain bodyDigest for historical readers and add a separate versioned
approval-input digest. Bind intent content using a digest plus the Git revision at which
it was read; store plan-to-spec binding separately. Commit identities locate historical
inputs while content identities avoid invalidation from harmless rebases. Reject local
source paths escaping the repository and unsafe revision/path arguments.

Use a two-column Requirements table (source criterion | behaviour IDs), the existing
Proof table and the existing runner result as inputs to a derived trace in the check
report. Preserve current findings normalization; add execution observations alongside
findings. Do not claim assertion adequacy from execution identity. A reviewer decides
whether an executed test proves the mapped requirement.

Extend review with an explicit PR evidence mode and machine-readable output. Query the
host rather than trusting candidate-controlled JSON for provenance. The implementation
will use documented host API fields and disclose policy visibility limits. CI saves the
existing candidate report containing trace evidence; a scope-only run clearly contains
no executed test proof. No privileged pull_request_target workflow or new secret is added.

## Out of scope

Items 4–6, dependency readiness, assignment, conflict scheduling, delivered-product view,
runtime verification, automatic requirement correction, cryptographic identity attestations,
universal test-runner support, paid campaigns, remote configuration changes and merging.

## Safeguards

Zero dependencies and no new registry control. Preserve item 1 isolation and item 2
candidate boundary checks. Never fabricate historical approval or host authorization.
Protected fixture sources remain unchanged. Preserve the human spec, plan and merge gates.
