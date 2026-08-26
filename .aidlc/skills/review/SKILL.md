---
name: review
description: Reviews a diff against its approved delivery contract and behaviour evidence, ranking findings by severity so humans focus on intent and risk. Use when preparing a pull request or checking an agent-written diff.
---

# Review the change

The reviewer's job is not to re-check what CI already checked. Follow `.aidlc/policies/review.md`.
Run `bash .aidlc/bin/harness check --stage commit` first and say nothing about anything it caught.
Create `.aidlc/artifacts/review/<slug>.md` with `harness new review <slug>` and record the
evidence, findings, decision, reviewer, and commit there. The committed review is the Deploy
handoff; a chat transcript is not an audit artifact.

## Passes, in order

1. **Correctness against the contract.** Walk each `B<n>` behaviour and its named evidence.
   A behaviour with no valid evidence is an Important finding.
2. **Scope against the contract.** Flag changed paths absent from `## Structure and ownership`.
3. **Risk.** Auth, data handling, migrations, error paths, concurrency, resource lifetimes.
   Read the error paths as carefully as the happy path — that is where agent-written code is
   weakest.
4. **Test integrity.** Were any existing tests modified, skipped, or loosened? Say so loudly.
5. **Maintainability.** Duplication the agent could not see, abstractions with one caller,
   naming that fights the domain vocabulary in the contract.

## Output

| Severity | Meaning | Cap |
|---|---|---|
| Blocking | wrong behaviour, security, data loss, spec unimplemented | no cap |
| Important | missing test, scope drift, risky error path | no cap |
| Nit | style, naming, preference | **max 5, then stop** |

Exclude generated paths and anything a check already enforces. Where you flag something, say
what to do about it — a finding without a remedy is a complaint.

## The one thing to look at first

Every suppression, threshold raise, or `# noqa` the change introduced. Those are the points
where the author overrode a control, and they are the highest-signal lines in any diff.
