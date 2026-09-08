# Review instructions

Follow this file. Findings do not approve a PR.

## Passes

Run three passes and tag each finding with its pass:

- Bugs: logic errors, broken edge cases, subtle regressions
- Security: injection risks, authentication gaps, PII in logs
- Compliance: the change matches the approved delivery contract, behaviour evidence, and design principles

## What Important means here

Reserve Important for findings that would break behaviour, leak data, or breach a policy. Style and naming are nits.

## Cap the nits

Report at most five nits per review; summarize the rest as a count.

## Do not report

Generated files and anything `harness check --stage commit` already enforces.

## Product and design evolution

Distinguish an authorized rule reversal from a behavior-preserving refactor and a bug fix.
A reversal names the old behavior in the new spec's supersedes; a refactor preserves behavior
assertions and records affected design/architecture references with continuity links. A bug
is corrected to meet the requirement, not copied back into the requirement to make it pass.
Inspect discrepancies before merge using the existing review gate.

Use `harness graph query product --revision <commit>` for recorded integration context.
Review source, behavior, design, candidate/merge and executed proof links separately; archived
unsigned host observations and graph edges cannot authenticate approval or prove correctness.
Unmerged proposals, missing evidence and unresolved replacements must remain visible.
