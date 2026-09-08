# Review: team-reuse

Local implementation self-review for item 6 only. The user approved the concrete spec/plan;
3912013 records that conversation decision, not authenticated host review. Historical approved
bodies and item 1–5 execution semantics remain unchanged. This is not an independent model
review, a hosted review or final human merge approval.

## Findings resolved

- The consumer resolver accepted any HARNESS_HOME checkout. Generated preflight now compares
  exact commit and covered raw content/modes before executing candidate code. An explicit
  mismatch cannot fall back to a cache. Cache-only identity is labelled pinned-content.
- Consumer init could render model guides into the shared runtime. It now preserves the pin;
  self-repository initialization remains responsible for rendering its configured models.
- Immediate process.exit could truncate large JSON exports at the pipe buffer boundary.
  The CLI now lets stdout drain; the CLI export regression reads and parses the full result.
- Missing/legacy records now refuse before shim execution. Budget migration tests retain
  direct proof of missing inventory and test the new preflight refusal before explicit upgrade.
- Isolated product runtimes omitted marketplace.json. Existing staging now includes that
  covered manifest; no fixture source or product runner was replaced.
- Identity verification compares raw blobs and executable modes, rejecting symlinks and
  bounding reads. Policy committed state cannot be hidden by assume-unchanged index flags.
  Git errors in identity reports omit local machine paths. Environment-selected Git directories
  cannot substitute a different checkout during identity observation.
- Export validates actor provenance and invocation/report consistency, rejects symlink reads
  and malformed evidence, and never fills old observations from today's environment.

## Acceptance and preservation

The product trial reuses the existing item-5 assertion procedure on hyphen and apostrophe
slices with separate simulated gates. Both fail before implementation, pass after it, retain
existing product assertions and export executed proof at their exact candidates. Two isolated
fresh installations compare equal initial runtime/policy identities; negative trials detect
wrong commits, changed runtime files and changed policy. Decisions are explicitly simulated.

Focused tests cover pre-execution refusal, env/cache selection, content-only caches, legacy
records, modes, symlinks, policy state, in-check mutation, large CLI output, unknown/malformed
actors, exact invocation export, missing/stale reports and legacy ledger reading. Existing
scope, trace, budget, installation and product-staging checks are retained. Full-stage results are recorded in evidence.md and local-report.json. The separate clean
base/candidate validation is archived in candidate-report.json after the evidence commit.

## Limits

The committed consumer pin and all exported observations are unsigned. Content equality is
not publisher authentication or an execution sandbox; callers still trust Node/Git, the
configured checks and the reviewed installation record. Doctor observes covered files, not
already-loaded provider prompts. Policy coverage is the explicit documented inventory, not
all transitive commands or remote organization policy. No physical-machine, hosted CI, paid
model, live host review, merge or deployment result is claimed. Docker-dependent product tests
require the separate opt-in environment; local deterministic trials do not substitute for it.
