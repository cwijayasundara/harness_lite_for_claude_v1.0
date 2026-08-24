# Plan: playbook-p0-kernel-tighten

- **Date:** 2026-08-24
- **Spec:** [.claude/artifacts/spec/playbook-p0-kernel-tighten.md](../spec/playbook-p0-kernel-tighten.md)
- **Risk tier:** standard
- **Status:** approved

## Files

```
.claude/lib/guard.mjs
.claude/hooks/dispatch.mjs
.claude/bin/harness
.claude/harness.toml
.claude/templates/harness.toml
.claude/test/guard.test.mjs
.claude/skills/implement/SKILL.md
.claude/CLAUDE.md
.claude/docs/OPERATING.md
```

## Order of work

Landed on `ab7da15`. This plan records the files that slice already touched so the artifact chain matches git.

## Proof

| Spec behaviour | Test |
|---|---|
| 1–2. require_plan on/off | `guard.test.mjs` require_plan tests |
| 3. lock tests CLI | `guard.test.mjs` lock round-trip |
| 4. production bash deny | `guard.test.mjs` productionDenied |
| 5. budget | `budget.test.mjs` |

## Risks

| Risk | Mitigation |
|---|---|
| Default-on wedges evals | Default remains false |
