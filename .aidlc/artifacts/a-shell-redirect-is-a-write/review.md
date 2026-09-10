---
status: draft
---
# Review: a-shell-redirect-is-a-write

Written by the evaluator against `spec.md` and `.aidlc/policies/review.md`. Every finding cites a
behaviour id or a review pass, and carries a severity.

## Findings

| Severity | Cites | Finding |
|---|---|---|

## Evidence and uncertainty

<Checks actually observed, unverified paths and limits of the review. Do not claim tests ran
without evidence. The caller runs checks separately from the evaluator.>

## Recommendation

<approve | changes-requested, and why in one sentence.>

## Design and delivery context

Classify discrepancies as authorized rule changes, preserved-behavior refactors, or bugs to fix
against the approved contract. Cite source/behavior and design references at exact revisions.
Inspect `harness graph query product --revision <commit>` where delivery records exist; retain
unknown coverage and conflicts. Approval is a proposal, integration is repository state, and
neither establishes deployment. Do not infer executed proof from a filename or graph edge.
