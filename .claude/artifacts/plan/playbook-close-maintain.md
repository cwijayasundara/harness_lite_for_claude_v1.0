# Plan: playbook-close-maintain

- **Date:** 2026-08-24
- **Spec:** [.claude/artifacts/spec/playbook-close-maintain.md](../spec/playbook-close-maintain.md)
- **Risk tier:** standard
- **Status:** approved

## Files

```
.claude/artifacts/intent/playbook-close-maintain.md
.claude/artifacts/spec/playbook-close-maintain.md
.claude/artifacts/plan/playbook-close-maintain.md
.claude/artifacts/review/playbook-close-maintain.md
.claude/artifacts/intent/playbook-p0-kernel-tighten.md
.claude/artifacts/spec/playbook-p0-kernel-tighten.md
.claude/artifacts/plan/playbook-p0-kernel-tighten.md
.claude/artifacts/review/playbook-operating-loop.md
.claude/lib/operations.mjs
.claude/lib/guard.mjs
.claude/bin/harness
.claude/test/operations.test.mjs
.claude/test/collect.test.mjs
.claude/test/contracts.test.mjs
.claude/harness.toml
.claude/templates/harness.toml
.claude/examples/collect-ci-failure-rate.mjs
.github/workflows/harness-monitor.yml
.claude/docs/OPERATING.md
.claude/docs/BUILD-PLAN.md
.claude/CLAUDE.md
README.md
```

## Order of work

1. Red: 3σ detect with rollback argv runs staging once; already-open does not; empty rollback still writes intent.
2. Green: `detect` calls `deploy(cfg, 'rollback', 'staging')` only on first tier-3 open.
3. Red/green: collector fail-open; wire `[monitoring].collect` here; `actions: read` on the monitor workflow.
4. Close P0 artifacts. Docs and draft reviews.

## Proof

| Spec behaviour | Test |
|---|---|
| 1. First 3σ runs staging rollback | `operations.test.mjs` 3σ staging rollback |
| 2. Already-open skips rollback | same test, second detect |
| 3. Unconfigured rollback still writes intent | existing 3σ test plus `rolled_back === false` |
| 4. Failed rollback keeps artifacts | `operations.test.mjs` rollback fail |
| 5. Collector fail-open + wired collect | collector test + `harness.toml` collect argv |
| 6. P0 artifacts approved | files exist with Status approved |

## Risks

| Risk | Mitigation |
|---|---|
| Hourly 3σ rollback against a real service | This repo leaves `[deployment].rollback` empty; only tests supply an adapter |
| Collector `gh` failure wedges detect | Fail open to empty bands |
