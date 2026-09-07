---
status: draft
extends: compare-native-claude
---
# Spec: prune-session-inventory

### B1
An experimental baseline/lean pair differs only in the automatic session-start budget inventory.
Both arms use the same capable model, unchanged graph behavior, requirements and private graders.
The lean arm retains ledger error warnings, current approval context and all executable checks.
### B2
The existing comparison runner calibrates and runs both complete product campaigns, recording
failed, unmeasured and incomplete attempts, recovery, approvals, cost and latency. Initial scope
is one paired repetition. The initial USD 9 / 20-minute run was incomplete. The user then
requested full validation and approved a fresh USD 9 / 40-minute matched pass with the repaired
disposable test timeout and documentation grader. Prior attempts remain recorded; this is a
bounded decision sample.
### B3
Retain the simpler production banner only if complete product evidence supports equivalent or
better correctness and recovery, with no approval violations. Compare cost and autonomy using
recorded phases; unknown metrics remain unknown. A worse or incomplete result retains the
baseline and records the reason. Firing frequency alone never authorizes removing a control.

### B4
A reproduced failed-test hang is bounded in disposable product checks and comparison prompts,
without editing fixtures or production configuration. Both matched arms use the same repaired
timeout and documentation heuristic; original failed attempts and unknown billing stay visible.

## Safeguards
No new production control, skill, role, hook binding or raised limit. Simulated trial decisions
remain external. No fixture or private assertion changes to obtain a passing result.
