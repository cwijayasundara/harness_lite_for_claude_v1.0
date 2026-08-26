# Plan: playbook-operating-loop

- **Date:** 2026-08-24
- **Spec:** [.claude/artifacts/spec/playbook-operating-loop.md](../spec/playbook-operating-loop.md)
- **Risk tier:** standard
- **Status:** approved

## Files

```
.claude/
.github/
.claude-plugin/
plugins/
README.md
.gitignore
```

## Order of work

1. Red: handoff CLI tests (committed approval creates next draft; uncommitted does not).
2. Green: `lib/handoff.mjs` + `harness handoff`.
3. Red: detect tests (unconfigured, file breach, already-open, collect argv).
4. Green: `operations.detect` + `harness monitor detect`.
5. Red: status playbook JSON + `closed` intent status.
6. Green: `lib/indicators.mjs` and lifecycle allow-list.
7. Marketplace + org-policy plugin + contracts. CI workflows. Docs.

## Proof

| Spec behaviour | Test |
|---|---|
| 1. Uncommitted approval is not a handoff | `handoff.test.mjs` uncommitted-gate |
| 2. Write creates draft spec once | `handoff.test.mjs` write-once |
| 3. Approved spec creates plan, never review | `handoff.test.mjs` spec-to-plan |
| 4. Handoff workflow opens a PR, not a push to main | `contracts.test.mjs` workflow text |
| 5. Marketplace + budget 12 | `contracts.test.mjs` + `budget.test.mjs` |
| 6–8. Detect unconfigured / breach / already-open / schedule | `operations.test.mjs`, contracts |
| 9–10. Playbook JSON and text | `lifecycle-cli.test.mjs` |

## Risks

| Risk | Mitigation |
|---|---|
| Handoff workflow loops on its own PRs | Write jobs only on the default branch; drafts stay off `main` |
| Detector opens a noisy intent every hour | Same-slug already-open; empty collect is a no-op |
| Org-policy counted in the kernel budget | Skills live under `plugins/org-policy/`, not `.claude/skills` |
