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
