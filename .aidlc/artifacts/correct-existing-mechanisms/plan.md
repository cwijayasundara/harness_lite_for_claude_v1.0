---
status: approved
by: cwijayasundara (conversation approval, recorded by Codex)
at: 2026-09-06T16:53:18.358Z
digest: sha256:5ebcfe1b81d7d68d3ac96f364c60259e2b57c2508b703f97cdb37cc9f214d71c
spec_digest: sha256:9f13ddb196e806b3ab156984b561338e2fabc1244febc2f9040a651d53aa91b4
---
# Plan: correct-existing-mechanisms

## Approach
Repair the runner, artifact state, existing hook dispatch, evaluator invocation and CI.
Keep approval decisions in the parent driver; give planning sessions read tools only and
implementation tools after decisions. Use the existing CLI's native read-tool restriction for
independent evaluation. Regenerate the stale plugin projection rather than add hook logic.
Alternative rejected: another approval service, policy layer or orchestration framework.

## Files
`evals/lib/stage.mjs`
`.aidlc/adapters/claude/hooks.json`
`.aidlc/bin/harness`
`.aidlc/evals/smoke/agent-mechanisms.json`
`.aidlc/evals/smoke/initial-sandbox-attempt.json`
`.aidlc/harness.toml`
`.aidlc/hooks/dispatch.mjs`
`.aidlc/instructions.md`
`.aidlc/lib/artifacts.mjs`
`.aidlc/lib/eval-gate.mjs`
`.aidlc/lib/guard.mjs`
`.aidlc/lib/normalize.mjs`
`.aidlc/lib/paths.mjs`
`.aidlc/lib/review.mjs`
`.aidlc/lib/runner.mjs`
`.aidlc/roles/evaluator.contract.json`
`.aidlc/roles/evaluator.md`
`.aidlc/sensors/test-quality.mjs`
`.aidlc/skills/intent/SKILL.md`
`.claude-plugin/plugin.json`
`.claude/CLAUDE.md`
`.github/workflows/harness.yml`
`docs/IMPROVEMENT-PLAN.md`
`docs/OPERATING.md`
`evals/agent-mechanisms.mjs`
`evals/lib/approvals.mjs`
`evals/lib/invoker.mjs`
`evals/run.mjs`
`test/autogate.test.mjs`
`test/contracts.test.mjs`
`test/eval-gate.test.mjs`
`test/evals.test.mjs`
`test/guard.test.mjs`
`test/lifecycle-cli.test.mjs`
`test/mechanisms.test.mjs`
`test/stop-guard.test.mjs`
`test/unit.test.mjs`

## Steps
1. Finish the existing mechanism corrections and plugin-boundary regression coverage.
2. Run deterministic checks, the actual-plugin integration smoke and independent review.
3. Publish the implementation branch, verify GitHub Actions, merge to main, push, and record evidence.

## Proof
| Behaviour | Evidence |
| B1 | `test/lifecycle-cli.test.mjs` and `test/unit.test.mjs` |
| B2 | `test/mechanisms.test.mjs` and `evals/agent-mechanisms.mjs` |
| B3 | `test/mechanisms.test.mjs` |
| B4 | `test/autogate.test.mjs`, `test/stop-guard.test.mjs` and actual-plugin smoke |
| B5 | `test/contracts.test.mjs` plus published GitHub Actions run |
| B6 | `test/eval-gate.test.mjs`, `test/evals.test.mjs` and `test/mechanisms.test.mjs` |
| B7 | `test/contracts.test.mjs`, `test/guard.test.mjs` and documentation review |
