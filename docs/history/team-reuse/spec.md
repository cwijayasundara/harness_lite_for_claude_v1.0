---
status: approved
extends: requirement-traceability
source_digest: sha256:7bbcd184ca7f237ae02b4c1c7cc19d89d4645f1c41cbebb10828adbee47e9e41
source: docs/SPDD-TEAM-EVOLUTION-PLAN.md
source_revision: 34835f0c75b43908af3ffccc551fae40e5edbd4f
source_kind: repository
intent_digest: sha256:af9b84d718d787dd3125b1b0902e1270e02d2d64532ca333c600114a72775f5c
intent_input_digest: sha256:73dc21eaaa6f0aef5c90f1927bccdd2a2b45f709486224be62522b6e896e9a34
intent_revision: 981a0c3fde7a15ab8232f9bd39f1445afbebacfd
by: cwijayasundara
at: 2026-09-08T15:13:13.557Z
digest: sha256:36b46ec0423ba1d1d8af3d79b0008f4490cf45dd540a2ea91251225edea8ead7
approval_version: 2
approval_digest: sha256:ec15000f3a93bb6421b8078e26710f9b25a57e744620934173e414e8d6c0540b
---
# Spec: team-reuse

## Outcome

Make shared runtime use reproducible and check evidence attributable, with an executed product
reuse example and explicit limits on what local verification establishes.

## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| local:F-two-fresh-environments-runtime-policy-identity | B1, B2 |
| local:F-visible-mismatch | B1, B2, B5 |
| local:F-export-change-actor-candidate-checks | B3, B4 |
| local:F-proven-procedure-reused-on-product-slice | B5 |

## Observable behaviours

### B1 — verify the selected runtime against the consumer record

Given a consumer installed from an exact Git revision, init records a versioned identity
alongside existing installation fields: commit plus a deterministic content manifest covering
shipped runtime code, hooks, guides, templates, policies and plugin manifests. Exclude mutable
state, historical delivery artifacts and product files. Define the manifest's path inventory
and digest algorithm explicitly; include executable modes and reject unsafe symlink entries.
Verify the installing checkout's covered bytes against its commit before claiming verified
provenance. A dirty/unavailable checkout must be labelled and cannot mint verified identity.

The generated shim verifies candidates before executing their code. HARNESS_HOME is an
explicit choice: mismatch refuses with expected/observed identities and a remedy, without
silently falling back. Cache discovery may select only a content match to the recorded identity,
never the newest arbitrary version. A Git checkout must also match the recorded commit;
a cache without Git may establish content equality to the pinned manifest, but cannot claim
independent Git provenance. No network lookup occurs during resolution. Direct runtime CLI
invocation against a consumer must expose the same identity findings through doctor/check.

### B2 — report actual runtime and effective policy identity

Doctor text and --json show expected and observed runtime identity, verification method,
covered paths and actionable mismatches. Effective project policy identity hashes the actual
configuration, canonical instructions, review policy and present provider/root steering files,
using sorted repository-relative names and bytes with explicit absent-file markers. Separate
runtime identity from project policy identity and expose committed versus dirty policy state.
Equal inputs in different directories yield equal digests. Editing one policy changes the
policy digest; editing a covered runtime file invalidates runtime verification even at the
same HEAD. Diagnostics do not claim to inspect prompts already loaded into a provider session.

Missing/malformed/legacy install records remain explicitly unverified, with an upgrade remedy;
do not invent commit provenance from a version directory. Doctor returns nonzero when a
consumer cannot verify its declared runtime. Preserve a labelled development mode for this
self-hosting repository, so legitimate approved runtime edits can be tested before commit.
Identity checks extend existing installer/doctor/check paths, not a new registered control.

### B3 — capture attributable execution evidence at run time

Each check invocation captures a unique invocation ID, time, selected change, actor provenance,
runtime/policy identity, repository HEAD and working-tree state. Candidate checks retain exact
base/candidate identity and existing executed-proof trace. Actor is an explicit --actor label
or a documented CI actor environment observation; absent identity is unknown. Neither is
authenticated review. CI run/job references, when present, remain environment assertions.
Avoid copying the entire environment, credentials, machine home paths or Git credential URLs.

Report and per-control ledger rows share this captured invocation identity. Do not infer
candidate proof for dirty/local checks or overwrite unavailable evidence with success. A
consumer runtime mismatch makes check unsuccessful and visible in its normal report/ledger.
Existing configured checks, skipped/failed/errored distinctions and candidate-change detection
remain intact. Detect policy/runtime changes during checks and mark evidence inconsistent.

### B4 — export the recorded evidence without upgrading its authority

Extend the existing ledger verb with `ledger export --invocation <id>` producing versioned
JSON on stdout. Select exact invocation rows and attach last-check only if its ID matches;
otherwise explicitly report the full check report unavailable. Preserve original timestamps,
actor, change, candidate, checks and runtime/policy observations. Do not fill historical fields
from today's environment or silently combine different runs. Invalid selectors, malformed
selected evidence and missing invocation fail clearly. Legacy rows remain readable by existing
report/audit commands and never become attributed retroactively. Export is local and unsigned;
host review evidence retains its separate item-3 authority assessment.

The consumer CI recipe fetches the recorded exact revision, verifies with doctor, runs the
candidate check and always archives its report/export, preserving failed-check exit status.
It explains policy comparison and legacy upgrade, without changing remote host settings.

### B5 — product reuse proof and compatibility

Extend existing disposable product staging/trials rather than add a runner or edit source
fixtures. Provision two isolated fresh runtime/consumer installations from the same revision,
compare identity, then demonstrate wrong-commit, changed-runtime and changed-policy cases.
Label this as a local two-environment simulation, not two physical machines or hosted CI.

Reuse one already proven procedure from existing product evidence on another bounded product
slice: preserve approved behavior assertions, capture a failing product assertion, implement
the slice, execute proof and export its exact evidence. Record the procedure's source example,
applicability, limits and policy revision in existing guidance. Each slice gets its own gates;
all fixture decisions are labelled simulations and old permissions confer no new authority.
Retain historical artifacts and item 1–5 semantics. Run focused tests, stop/commit stages and
a clean exact-candidate check; archive commands/results and update item 6's delivery record.

## Design

Add a shared zero-dependency runtime identity helper, consumed by installer, doctor and runner.
Generate a minimal pre-execution manifest verifier into the consumer shim from the same
implementation, so verification does not trust the candidate's own verifier. The committed
consumer record is the comparison anchor, not a cryptographic publisher signature. Hash
policy bytes at execution time separately from the shipped runtime manifest. Extend existing
report and ledger schema additively, retaining legacy readers and explicit unknown values.

## Out of scope

New controls, hooks, dependencies, skills, scheduling, tracker integration, paid trials,
signed supply-chain attestations, sandboxing arbitrary runtime code, physical-machine claims,
automatic policy rollout, remote configuration, publishing, merge and deployment.

## Safeguards

Preserve budget and genuine approval gates. Bound reads, reject traversal/symlink escapes,
avoid credential capture and arbitrary runtime execution during preflight. Missing metadata
does not grant authority. Do not silently rewrite policy, installation pins or old evidence.
