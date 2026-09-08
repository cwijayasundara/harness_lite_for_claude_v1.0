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

## Reusing a proven product procedure

For a second bounded change to a pure formatting function, reuse the procedure demonstrated by
`.aidlc/artifacts/product-design-context/post-fix.mjs`: name the source criterion, approve the
new slice's own spec/plan, retain applicable behavior assertions, add an assertion that fails
before the change, implement, and capture exact-candidate executed proof. Apply it when the
function and expected outputs are deterministic; it does not establish distributed-system,
migration or deployment correctness. A changed requirement needs its own reviewed contract.
Historical approval is never permission for the next slice. Item 6's team-reuse product trial
records the second application, policy digest and runtime revision with its exported evidence.
