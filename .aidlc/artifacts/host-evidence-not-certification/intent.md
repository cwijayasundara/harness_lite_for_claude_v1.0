---
status: draft
source: docs/IMPROVEMENT-PLAN.md
source_revision: 07ef61499d6870b9b51ef46ec42712d92fde25ae
parent: lean-review-host-identity
---
# Intent: host-evidence-not-certification

- **Date:** 2026-09-08
- **Author:** Claude, recording the user's request to take the lean-review host
  review and runtime identity row through the AIDLC workflow
- **Source:** Lean review, 8 September 2026 in `docs/IMPROVEMENT-PLAN.md` at
  `07ef614`, third disposition row: host review and runtime identity.

## Problem

The host-review and runtime-identity mechanisms are honest today. `hostReview`
downgrades to `policy-unavailable` whenever a branch control is invisible,
never reports `verified` for simulated transport or partial policy, and
`runtimeIdentity` distinguishes `git-and-content` from `pinned-content` and
refuses to repin itself. Nothing in the current code claims more than it saw.

What is missing is a stated limit. Nothing records that the five host
assessment states, the single `verified` condition, the identity coverage
roots and the `verified: false` product-context reading are the ceiling rather
than a starting point. The same accumulation the lean review measured
elsewhere would look, here, like extra assessment states, a locally derived
merge-eligibility verdict, more delivery keys carrying host verdicts, or a
signing or attestation verb — each defensible on its own, and together a local
certification system standing in for the host's merge policy.

The review row asks to preserve the honest candidate and pin checks, keep host
merge policy authoritative, and avoid expanding local policy emulation or
unsigned evidence into a certification system.

## Proposed outcome

The current honest surface is frozen and stated. Host review remains
point-in-time evidence; the host's merge controls remain the authority; local
JSON, local `--by` labels, actor labels and runtime pins remain unsigned
observations that certify nothing. A reader of the README, the canonical
instructions and the review policy is told this plainly, and a test fails if
the surface grows a new assessment state, a new `verified` path, a locally
derived merge verdict, a new host verdict field, or a signing verb.

No runtime behaviour changes.

## Affected users and systems

Engineers and agents using `harness review --repo/--pr`, `harness doctor`,
`harness graph query product`, the runtime shim and installation pin, and the
README, canonical instructions and review policy that describe them.

## Constraints

- Do not change `hostReview`, `runtimeIdentity`, `policyIdentity`,
  `executionIdentity`, the shim verifier or the delivery reader's behaviour.
- Do not remove the conservative branch-policy checks the review said to
  preserve, and do not add new ones.
- Do not add a signing, attestation, merge, push or host-write verb.
- Do not add skills, agents, hook bindings, or raise `[limits]`.
- Do not rewrite other changes' approvals or approved artefact bodies.

## Open questions

None
