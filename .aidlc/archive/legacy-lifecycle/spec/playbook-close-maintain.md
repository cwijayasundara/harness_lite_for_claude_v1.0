# Spec: playbook-close-maintain

- **Date:** 2026-08-24
- **Intent:** [.claude/artifacts/intent/playbook-close-maintain.md](../intent/playbook-close-maintain.md)
- **Status:** approved

## Behaviour

1. When `harness monitor detect` first records a tier-3 (or min/max) breach and `[deployment].rollback` is a non-empty argv array, it runs that command with environment `staging` and writes a deployment receipt. It never uses environment `production` for this path.
2. A second detect for the same slug reports `already_open` and does not run rollback again.
3. When rollback is unconfigured (empty argv), a tier-3 detect still writes incident and draft intent, reports `rolled_back` false, and exits 0.
4. A failed staging rollback does not delete the incident or intent. Detect still reports the breach and `rolled_back` false.
5. This repository's `[monitoring].collect` invokes `.claude/examples/collect-ci-failure-rate.mjs`. Without `GITHUB_REPOSITORY` and a GitHub token, the collector prints an empty `bands` array and exits 0 so detect is a no-op. A `gh api` failure also prints an empty set and exits 0.
6. `playbook-p0-kernel-tighten` is an approved intent with a spec and plan that describe the landed plan-lock, test-lock CLI, and production bash deny. `[guard].require_plan` remains false in templates and in this repo.

## Out of scope

- Pushing managed settings from MDM or the admin console.
- Storing `ANTHROPIC_API_KEY` in GitHub secrets.
- Cowork / Claude Design / Claude Tag product integrations beyond the existing issue intake.
- Replacing `org-policy` example text with a signed corporate policy.
- Filling `[deployment].deploy` for this kernel repo.
- Turning `[guard].require_plan` on here.
- Running the live eval suite without Claude credentials.

## Domain vocabulary

- **Staging rollback:** `harness deploy rollback staging` / `operations.deploy(..., 'rollback', 'staging')`.
- **Already open:** incident or intent for the breach slug already exists.
- **Fail open (collector):** missing GitHub context or API error → empty bands, exit 0, never an invented breach.

## Constraints and invariants

- Production rollback or deploy is never invoked from detect.
- No model in `harness-monitor.yml`.
- Kernel budget unchanged.

## Visual design

Not user-facing. No mocks.

## Policy concerns flagged

- GitHub token on `harness-monitor.yml` needs `actions: read` to query workflow runs — platform owner.
- A noisy CI failure rate can open hourly PRs once collect is live — service owner should tune mean/stdev on the collector, not disable detect.
