# Intent: status-grades-two-lifecycles

- **Status:** draft
- **Author:** cwijay@biz2bricks.ai

## Problem

`harness status` runs two artifact models over the same slug and they disagree, so a change taken
correctly through the contract chain reports INVALID and the command exits 1:

```
lifecycle
  p0-unblock-the-loop   spec   INVALID   within
  ERROR p0-unblock-the-loop: review exists before plan approval
contracts
  p0-unblock-the-loop   review   valid
```

`.aidlc/lib/lifecycle.mjs:5` holds `KINDS = ['intent', 'spec', 'plan', 'review']` and requires
`.aidlc/artifacts/spec/<slug>.md` and `plan/<slug>.md` to exist and be approved before a review.
The delivery contract replaced both: CLAUDE.md defines the chain as `intent-ref -> delivery
contract -> diff -> evidence -> review`, and spec and plan are now sealed *sections* of the
contract carrying their own approval digests. Doing the workflow right is what makes the legacy
validator fail.

This stayed invisible while `.aidlc/artifacts/` was empty — `status` printed "lifecycle no
artifacts". The first change to complete the chain surfaced it.

## Outcome

One model. `harness status` exits 0 and reports a single integrity verdict for a change that has
a valid contract, evidence, and review.

## Affected systems

`.aidlc/lib/lifecycle.mjs`, whatever in `.aidlc/bin/harness` renders the `lifecycle` block, and
`harness new review` — which writes into the legacy `review/` tree that the contract model also
reads.

## Constraints

The budget is full. This should subtract, not add: the likely answer is deleting the legacy
lifecycle validator rather than teaching it about contracts, since `.aidlc/archive/legacy-lifecycle/`
already holds the artifacts it was written for.

## Open questions

Delete the legacy lifecycle entirely, or keep it for repositories that installed the harness
before contracts existed? If kept, it needs to detect which model a slug uses rather than
assuming the old one. This is a design decision for the maintainer, not a mechanical fix.
