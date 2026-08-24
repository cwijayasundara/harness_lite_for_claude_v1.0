# Intent: playbook-operating-loop

- **Date:** 2026-08-24
- **Opened at:** 2026-08-24T12:00:00.000Z
- **Author:** Chaminda Wijayasundara
- **Status:** approved
- **Source:** conversation — Anthropic AI-native SDLC playbook compatibility items 1, 2, 5, and 7

## Problem

The harness already writes `intent.md`, `spec.md`, and `plan.md`, but an accepted artifact does
not start the next stage. Product owners still have to paste “Approved. Continue the workflow”
into a chat. Organization policy (security, brand, UX) has nowhere to live except the frozen
12-skill kernel. Production control-band detection cannot write the next intent unless a person
runs ingest by hand. `harness status` reports per-change SLAs, not the playbook’s leading
indicators, so we cannot tell whether the chain is getting faster.

## Proposed outcome

A committed approval of intent or spec is enough to open the next-stage draft as a pull request,
with no chat prompt. Policy skills load from a second plugin that does not count against the
kernel budget. A scheduled, model-free detector writes incident and intent when a numeric band
is breached. `harness status` prints the playbook indicators from git history and the latest
eval result.

## Affected users and systems

Product owners, platform engineers, Claude Code sessions, GitHub Actions, `bin/harness`,
`harness status`, the kernel skill budget.

## Constraints

- Skills stay at 12, agents at 3, hook bindings at 5. Policy skills must not live under
  `.claude/skills`.
- Detection stays deterministic. No model in the detector. Diagnose, if any, happens after
  the intent exists.
- Handoff creates the next *draft* artifact only. It must not set Status to approved.
- Production deploy and human merge gates stay as they are.
- Zero runtime dependencies.

## Open questions

- GitHub Actions is the first handoff adapter because this repo already reviews and protects
  there. The CLI must still work in a disposable git repo with no `gh`.
- Closed intents are needed for the survival rate. Add `closed` as a valid intent status.
