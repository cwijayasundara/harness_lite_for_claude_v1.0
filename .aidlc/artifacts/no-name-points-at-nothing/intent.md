---
status: closed
migrated_from: aidlc.contract/v1
---
# Intent: no-name-points-at-nothing

- **Status:** approved
- **Author:** cwijayasundara

## Problem

Two names in this repository point at things that do not exist, and both look like work.

**A stage naming a check with no implementation.** `examples/scratch-py` and `examples/scratch-ts`
both declare:

```
commit = ["stop", "secrets", "plan-drift", "budget"]
```

`plan-drift` has no implementation. `runner.mjs:15` registers `secrets`, `scope-drift` and
`budget`; nothing else is a local check, and `plan-drift` is not a capability verb either. The two
example projects — the two files a newcomer copies from — run a commit stage naming a control that
cannot resolve, and the CI `cost` job runs inside one of them.

This is the third appearance of exactly this defect. `evals/fixtures/_base` carried the same dead
name until `eval-suite-tells-the-truth`, which left contract scope enforcement with no eval
coverage at all and made `contract-scope-honesty` unfalsifiable. It was fixed there by pinning the
fixture's stages to the template's. The examples were never checked.

**An intent that reads as open work.** `status-grades-two-lifecycles` is still `draft`. It
described `harness status` reporting INVALID for a change taken correctly through the contract
chain — which `retire-the-legacy-lifecycle` resolved. A backlog that lists finished work is a
backlog nobody trusts, and this one is now the only draft intent in the repository.

## Outcome

Every stage entry names something the runner can resolve, a test says so, and the backlog lists
only work that is actually outstanding.

## Affected systems

`examples/scratch-py/.aidlc/harness.toml`, `examples/scratch-ts/.aidlc/harness.toml`,
`.aidlc/lib/runner.mjs` (to expose what a name may resolve to), `test/contracts.test.mjs`, and
the `status-grades-two-lifecycles` intent.

## Constraints

The examples are not the template and must not be flattened into it. `scratch-ts` runs
`typecheck` where `scratch-py` runs `fmt`, because they are different languages — that difference
is the point of having two examples. What must hold is that every name resolves, not that every
project runs the same stages.

The check must cover every `harness.toml` in the repository, including ones added later. A test
that lists today's files by hand is the same class of thing as the defect it catches.

## Open questions

Whether `harness doctor` should perform this resolution against a project's own config at install
time, so a downstream project learns about a dangling name without running this repository's
tests. Probably yes; not done here.
