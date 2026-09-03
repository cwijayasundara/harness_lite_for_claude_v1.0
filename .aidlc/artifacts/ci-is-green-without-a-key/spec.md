---
status: draft
migrated_from: sha256:ffd1c964b912bd7df6291aa1a13c9d1c463ef8df8239262e9a3d40f40e3202b4
---
# Spec: ci-is-green-without-a-key

## Outcome

A push to a repository with no secrets and no variables produces a run list with nothing red in
it, so the next red run means something.

## Observable behaviours

### B1

Given no repository variable is set,
When a workflow job that can invoke a model is evaluated,
Then GitHub skips it: the job carries a job-level `if` on the switch, so no runner is allocated
and no step reads a secret. Started-and-exited-early does not satisfy this.

### B2

Given the six model-invoking jobs,
When their guards are read,
Then all six name the same single repository variable, and any value other than the enabling one
leaves every one of them off. One switch, off by default.

### B3

Given the switch set to its enabling value,
When the jobs are evaluated,
Then they run. The guard must be a switch, not a wall — a control that cannot be turned back on
is a deletion wearing a disguise.

### B4

Given a new workflow that calls `anthropics/claude-code-action` or passes `ANTHROPIC_API_KEY`
without the guard,
When the unit suite runs,
Then it fails, naming the offending file. This is what keeps B1 and B2 true after this change.

### B5

Given the jobs that run without a key — `unit` and `cost` —
When the suite and the ratchet run on a machine with neither `ruff` nor `pytest` nor `claude`,
Then both still pass, and both still fail when they should. Green is not reached by muting them.

### B6

Given the contract assertions already made about these workflows,
When the unit suite runs,
Then they still hold: the review job stays read-only and cannot declare a gate approved, the fix
job can push but cannot approve or merge, and the monitor and rehearse workflows still call no
model.

### B7

Given `harness-intent.yml`,
When an issue is labelled `intent` on a repository with no key,
Then the job runs and produces a deterministic draft. Its model step already carries
`if: secrets.ANTHROPIC_API_KEY != ''` with a key-free fallback, and the owner's 2026-08-24
decision was that this half stays live. Gating the job would disable the one model-adjacent
workflow that does useful work without a key — so it is the one file here left alone.

The count in B2 is therefore five jobs, not six.

## Out of scope

Adding any secret, key, token or credential, including a test-only one. Deleting any workflow,
job, step, test or check. `harness-protection.yml`, which is `workflow_dispatch`-only and never
contributes to a red push. Re-enabling automated review or evals, which is what the switch is
for and is the owner's decision, not this change's.

## Safeguards

- B4 is the safeguard that matters: without it, the next workflow someone adds re-opens the hole
  silently, which is exactly how this repository got here.
- B5 keeps the two jobs that do run honest — a green board bought by muting `unit` or `cost`
  would be worse than a red one.
- B6 pins the permission assertions already proven about these files, so gating changes *when* a
  job runs and never *what it may do* when it does.
- `unit` and `cost` are explicitly not gated: they need no key and must run on every push, or the
  repository has no CI at all rather than quiet CI.

## Entities and existing context

- The six: `claude-fix.yml`, `claude-review.yml`, `harness-diagnose.yml`, `harness-intent.yml`,
  `harness-triage.yml`, and the `evals` job of `harness.yml`. None carries a `vars.` reference
  today.
- `harness.yml` — `unit` and `cost` need no key and must keep running on every push. Only `evals`
  is gated.
- `harness-triage.yml` triggers on `workflow_run` of `harness`, so it fires on every failure and
  then fails itself. Gating it removes the doubling.
- `test/contracts.test.mjs:70,102,107` — existing assertions about `claude-review.yml`,
  workflows that must not exist, and `harness-monitor.yml`. B6 is these, unchanged.
- `test/playbook-pack.test.mjs:14` — asserts on `claude-fix.yml`. Also B6.
- `harness-rehearse.yml`, `harness-monitor.yml`, `harness-protection.yml` — already gated or
  key-free; untouched.
