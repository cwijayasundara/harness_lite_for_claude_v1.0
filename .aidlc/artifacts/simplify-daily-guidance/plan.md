---
status: approved
by: cwijayasundara (conversation approval, recorded by Codex)
at: 2026-09-06T19:44:54.038Z
digest: sha256:336b799b9f009cb4cdb4d0257731f747c150a686c89aea454f86b89600336124
spec_digest: sha256:fc9c7d16cec4ead1c4683026dd87fd4fc4c39c7f831eb660c38819741ef2219e
---
# Plan: simplify-daily-guidance

## Approach
Simplify existing prose and projections, keeping executable approval gates unchanged.
Extend the existing opt-in mechanism smoke with a bounded before/after guidance comparison.
Use the current capable generator on identical scenarios; independently check decisions and
product outputs. Record limitations rather than treating this as a full product campaign.

## Files
`.aidlc/instructions.md`
`.claude/CLAUDE.md`
`.aidlc/roles/evaluator.md`
`.aidlc/skills/intent/SKILL.md`
`.aidlc/skills/spec/SKILL.md`
`.aidlc/skills/plan/SKILL.md`
`.aidlc/skills/implement/SKILL.md`
`.aidlc/skills/change-safely/SKILL.md`
`.aidlc/skills/diagnose/SKILL.md`
`.aidlc/skills/map/SKILL.md`
`.aidlc/templates/intent.md`
`.aidlc/templates/spec.md`
`.aidlc/templates/plan.md`
`.aidlc/templates/review.md`
`docs/OPERATING.md`
`docs/IMPROVEMENT-PLAN.md`
`evals/agent-mechanisms.mjs`
`test/mechanisms.test.mjs`
`.aidlc/evals/smoke/guidance-comparison.json`

## Order
1. Revise existing skills, templates, canonical instructions and operating guidance together.
2. Extend evals/agent-mechanisms.mjs and verify its deterministic helpers in test/mechanisms.test.mjs.
3. Run full checks, bounded live comparison, independent review and hosted CI; merge and push.

## Proof
| Behaviour | Test or evidence |
|---|---|
| B1 | Bounded identical before/after clarification and coherent-outcome scenarios |
| B2 | Existing guard/lifecycle tests plus routine test maintenance and material-scope scenarios |
| B3 | Runtime assertions on generated solutions and existing full suite |
| B4 | Independent explicit-candidate review, projection verification and full stop/commit checks |
