# Review: playbook-close-maintain

- **Date:** 2026-08-24
- **Plan:** [.claude/artifacts/plan/playbook-close-maintain.md](../plan/playbook-close-maintain.md)
- **Status:** draft
- **Reviewer:** agent (draft; human owns Gate 3)
- **Commit:** pending

## Verification

Run `node .claude/bin/harness check --stage commit` on this change. Live evals were not run: no Claude credentials on the authoring machine.

## Spec coverage

| Spec behaviour | Implemented | Test evidence |
|---|---|---|
| 1. First 3σ runs staging rollback | yes | `3σ with rollback configured runs staging once and never production` |
| 2. Already-open skips rollback | yes | same test, second detect |
| 3. Unconfigured rollback still writes intent | yes | `1σ logs and 2σ...` `rolled_back === false` |
| 4. Failed rollback keeps artifacts | yes | `a failed staging rollback keeps the incident and intent` |
| 5. Collector fail-open + wired collect | yes | `collect.test.mjs`; this repo `harness.toml` collect argv |
| 6. P0 artifacts approved | yes | intent/spec/plan Status approved |

## Findings

| Severity | File/line | Finding | Required remedy | Status |
|---|---|---|---|---|
| — | — | none | — | — |

## Risk and rollback

Staging rollback is argv-gated. This kernel repo leaves `[deployment].rollback` empty, so hourly detect cannot roll anything back here. A product that sets the argv must have rehearsed it (`harness-rehearse.yml`).

## Decision

Draft. Human Gate 3: approve after `--stage commit` is green on the PR.
