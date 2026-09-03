# Delivery contract: ci-is-green-without-a-key

- **Schema:** aidlc.contract/v1
- **Change id:** ci-is-green-without-a-key
- **Intent ref:** ../intent-refs/ci-is-green-without-a-key.json
- **Story ref:** none
- **Risk:** standard
- **Spec status:** draft
- **Spec approval digest:** pending
- **Plan status:** draft
- **Plan approval digest:** pending

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

## Out of scope

Adding any secret, key, token or credential, including a test-only one. Deleting any workflow,
job, step, test or check. `harness-protection.yml`, which is `workflow_dispatch`-only and never
contributes to a red push. Re-enabling automated review or evals, which is what the switch is
for and is the owner's decision, not this change's.

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

## Approach and rejected alternatives

One repository variable, `HARNESS_MODEL_JOBS`, compared against `enabled` in a job-level `if` on
each of the six. GitHub evaluates job-level conditions before allocating a runner, which is what
B1 requires and what a step-level guard cannot give.

A unit test walks `.github/workflows/`, finds every job that references
`anthropics/claude-code-action` or `ANTHROPIC_API_KEY`, and asserts each carries the guard. That
is B4, and it is the part that survives us.

Rejected: `secrets.ANTHROPIC_API_KEY != ''` as the condition. GitHub does not expose secrets in
job-level `if`, so the guard would have to move into a step — which allocates a runner and starts
the job, failing B1.

Rejected: deleting the six workflows. They are the worked reference for the model seams, and the
owner's 2026-08-24 decision was explicitly to keep them.

Rejected: a per-workflow variable. Six switches is five more chances to leave one on, and the
outcome asks for a repository where *nothing* model-driven runs by default.

Rejected: re-fixing the three causes the archived spec named. They are already fixed, measured
today. Re-doing them would be work against a description of the repository rather than the
repository.

## Structure and ownership

| Path | Change |
|---|---|
| `.github/workflows/claude-fix.yml` | job-level guard |
| `.github/workflows/claude-review.yml` | job-level guard |
| `.github/workflows/harness-diagnose.yml` | job-level guard |
| `.github/workflows/harness-intent.yml` | job-level guard on the model job only |
| `.github/workflows/harness-triage.yml` | job-level guard |
| `.github/workflows/harness.yml` | job-level guard on `evals`; `unit` and `cost` untouched |
| `test/contracts.test.mjs` | B2, B4 and B6 |

## Safeguards

- B4 is the safeguard that matters: without it, the next workflow someone adds re-opens the hole
  silently, which is exactly how this repository got here.
- B5 keeps the two jobs that do run honest — a green board bought by muting `unit` or `cost`
  would be worse than a red one.
- B6 pins the permission assertions already proven about these files, so gating changes *when* a
  job runs and never *what it may do* when it does.
- `unit` and `cost` are explicitly not gated: they need no key and must run on every push, or the
  repository has no CI at all rather than quiet CI.

## Operations

1. Add `if: vars.HARNESS_MODEL_JOBS == 'enabled'` to the model-invoking job in each of the six.
2. Add the workflow-walking guard test to `test/contracts.test.mjs` for B2 and B4.
3. Confirm B6 by running the existing contract assertions unchanged.
4. `harness check --stage commit`.
5. Confirm B5 by running the suite and `baseline check` on a PATH with neither `ruff`, `pytest`
   nor `claude`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | the guard is job-level in all six files; GitHub skips before runner allocation |
| B2 | `test/contracts.test.mjs` — every model-invoking job names the one variable |
| B3 | the same guard read as an enabling condition; setting the variable turns all six on |
| B4 | `test/contracts.test.mjs` — a model-invoking job without the guard fails the suite |
| B5 | suite and `baseline check` on a runner-like PATH: 212 tests 0 failures, ratchet exits 0 |
| B6 | `test/contracts.test.mjs` and `test/playbook-pack.test.mjs`, unchanged |
