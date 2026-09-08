---
status: approved
extends: correct-existing-mechanisms, correct-paid-rule-heuristic, compare-native-claude, complete-native-comparisons, close-the-harness, prune-session-inventory
by: cwijayasundara (cleanup authorization in conversation, recorded by Codex)
at: 2026-09-08T08:23:21.965Z
digest: sha256:ab33c7f8b0042c9394c4e5fc4b48304e6d062f3a92fcc6eaf91a37cfccf01538
---
# Spec: clean-project-scaffold

### B1
Given an empty consumer Git repository, when harness init runs, then it writes only project configuration, instructions, review policy, plugin declaration, install record and CLI shim, with empty project artifact/state directories. Harness source, this repository's artifacts, evals, tests, examples and credentials are not copied. The project uses the shared versioned plugin. Existing hand-edited instructions/configuration are preserved on reinstall.

### B2
Given a freshly scaffolded project, its instructions name the current intent/spec/plan/implementation/review workflow and valid commands, without removed contract/seal/model-resolver instructions. The config does not advertise removed deployment subsystems. A maintenance breach writes a draft intent discovered by the current harness and never overwrites an existing intent.

### B3
Given the development repository, tracked evaluation reports live under evals/evidence while generated run output stays ignored. Existing results, costs and approval bodies are preserved. Examples retain their useful Python/TypeScript validation, with generated caches and retired metadata removed. Completed implementation intents are closed; incomplete comparison acceptance remains explicitly documented.

## Boundaries
Keep the shared-plugin architecture and current production controls. No standalone vendoring mode, paid benchmark, new agent or increased control limits.
