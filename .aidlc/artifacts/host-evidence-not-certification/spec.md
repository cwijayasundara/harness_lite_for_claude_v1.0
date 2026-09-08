---
status: draft
extends: limit-coordination-context
source: docs/IMPROVEMENT-PLAN.md
source_revision: 07ef61499d6870b9b51ef46ec42712d92fde25ae
parent: lean-review-host-identity
---
# Spec: host-evidence-not-certification

## Outcome

Host review stays point-in-time evidence and runtime pins stay comparison
anchors. The host's merge controls remain the authority; the harness derives
no merge eligibility of its own and issues no certificate. The current honest
surface is the ceiling, stated in the guidance and held by a test, so the next
plausible addition has to argue against a recorded limit rather than fill a
silence.

## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| local:preserve-honest-candidate-and-pin-checks | B1, B3 |
| local:host-merge-policy-authoritative | B2, B4 |
| local:no-certification-expansion | B5 |

## Observable behaviours

### B1

Given `harness review --repo owner/name --pr <n> --candidate <commit>`,
When it collects host evidence,
Then it still reports exactly one of `unavailable`, `candidate-mismatch`,
`changes-requested`, `policy-unavailable`, `approval-not-established` and
`host-policy-approved`, and `verified` is true only when provenance is
`github-api` and the assessment is `host-policy-approved`. A head that differs
from the candidate is still `candidate-mismatch`. Simulated transport, an
invisible or stricter branch control, a stale, dismissed or non-pushing
approver, and an API failure still never verify. The saved report still carries
its `verification_scope` and `limitation` strings naming the host's merge
controls as authoritative and the JSON as not a signed attestation.

### B2

Given the same command and the rest of the CLI,
When a caller wants to know whether a change may merge,
Then the harness answers only with what the host reported: the host's own
review decision, the visible branch review count, and current reviewers with
push access. It derives no merge-eligibility verdict of its own, and still
downgrades to `policy-unavailable` whenever the required count is invisible or
code-owner or last-push controls are enabled. Merge identity is recorded only
when the host supplies it. There is no verb that signs, attests, certifies,
approves, merges or pushes, and host evidence still grants no local write
scope.

### B3

Given an installed runtime and a project policy,
When identity is verified,
Then `runtimeIdentity` keeps its existing coverage roots and its `verified` /
`development` / `unverified` / `mismatch` outcomes, still separates
`git-and-content` from `pinned-content`, still refuses symlinks, dirty covered
content and non-Git sources as unverified, and still never repins itself. The
shim still verifies before executing runtime code and never loads a candidate
to verify it. `executionIdentity` still reports `authenticated: false` and
`trust: 'unsigned-local-observation'`, and an actor label or `GITHUB_ACTOR`
remains an assertion.

### B4

Given an archived host-review report referenced by a `delivery.json`,
When `harness graph query product --revision <commit>` reads it,
Then the host row is still reported with `verified: false` and its archived
unsigned-observation limitation, and the delivery record schema keys are
unchanged. A recorded merge is recorded integration, never acceptance,
deployment, or authenticated approval.

### B5

Given the README host-review and runtime sections, the review policy, and the
lean-review row in `docs/IMPROVEMENT-PLAN.md`,
When a reader asks what the harness claims about approval and merge,
Then those surfaces say plainly that host merge policy is authoritative, that
the harness emulates no merge decision, and that local JSON, pins, digests and
`--by` labels are unsigned observations that certify nothing. The lean-review
row records the limit: honest candidate and pin checks preserved, host merge
policy authoritative, no expansion into local policy emulation or a
certification system. No skill, agent, hook binding or `[limits]` increase is
added.

## Design

This is a freeze, not a mechanism. The existing readers in
`.aidlc/lib/review.mjs`, `.aidlc/lib/runtime-identity.mjs` and
`.aidlc/lib/product-context.mjs` are already honest, and their behaviour does
not change. One test file states the ceiling by reading the shipped source and
guidance, in the same shape as `test/limit-coordination.test.mjs`, so growth in
this area fails a check instead of passing review on its own merits.

The rejected alternative is reducing the conservative branch-policy checks to
the host's `reviewDecision` alone. Those checks are the honest part the review
asked to preserve: they refuse a verdict when a control is invisible. Also
rejected is trimming derived host fields from the product-context reading;
`recorded_verification` distinguishes what an archive claimed from what this
run verified, and removing it loses provenance without removing authority,
which no defect asks for.

## Out of scope

- Any change to host review, runtime identity or delivery-reading behaviour.
- New assessment states, policy fields, delivery keys or identity roots.
- Signing, attestation, key management, or a merge or push verb.
- GitHub rulesets, code-owner identity or last-pusher independence support.
- Canonical instructions and generated `.claude/CLAUDE.md`: this is CI and
  human-review guidance, not per-session agent context.
- Paid product trials.

## Safeguards

- No runtime behaviour changes, so existing host-review, runtime-identity and
  product-context tests keep their exact meaning.
- The freeze test must fail if the surface grows, not merely if it is renamed;
  it reads the shipped source, help output and guidance.
- Credential-bearing stderr still never reaches saved evidence.
- Control budget stays at registry `[limits]`; `claude_md_lines` is untouched.
