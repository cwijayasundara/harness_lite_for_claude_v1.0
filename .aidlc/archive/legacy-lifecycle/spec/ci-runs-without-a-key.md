# Spec: ci-runs-without-a-key

- **Date:** 2026-08-24
- **Intent:** [.claude/artifacts/intent/ci-runs-without-a-key.md](../intent/ci-runs-without-a-key.md)
- **Status:** draft <!-- draft | approved  (HUMAN GATE 1) -->

## Out of scope

Written first, because this change sits next to four things it must not touch.

- **The three `INVALID` artifact chains on `main`** — `docs-to-repo-root`,
  `supporting-artefacts-to-root`, `empty-suite-is-not-a-pass`. Owner decision, 2026-08-24:
  their own intent. This change neither repairs nor worsens them, and `harness status` stays
  red for them afterwards.
- **`harness-protection.yml`.** Owner decision, 2026-08-24: unchanged. It is
  `workflow_dispatch`-only, so it never contributes to a red push, and a human who clicks Run
  without `HARNESS_ADMIN_READ_TOKEN` still gets a failure. Accepted.
- **The `errored` vs `fail` classification gap.** A control whose binary is missing is graded
  `errored`; a control whose binary is present but misconfigured (`pytest` without
  `pytest-json-report`) is graded `fail`. That gap is real, is the reason the cost job fails on
  this laptop, and is **not** the reason it fails on a runner. Fixing it needs its own `why:`
  and its own evidence. Behaviour 6 below is satisfied without it.
- **Adding any secret, key, token, or repository-level credential.** Including test-only or
  dummy values.
- **Deleting any workflow, job, step, test, or check.** The outcome is explicitly not
  satisfiable by removing the thing that was red.

## Behaviour

1. **A job that can invoke a model does not start unless it is explicitly enabled.** Every job
   that references `anthropics/claude-code-action` or passes `ANTHROPIC_API_KEY` to a
   command is guarded such that, with no repository variable set, GitHub reports the job as
   skipped and no step in it executes. The guard is evaluated by GitHub before the runner is
   allocated — "the step ran and exited early" does not satisfy this.

2. **The guard is a single named switch, and it is off by default.** One repository variable
   controls every such job. Absent or set to anything other than the enabling value, all of
   them stay off. Setting it to the enabling value turns all of them on, and is the only
   repository-side change required besides the secret itself.

3. **A push to `main` on a repository with no secrets and no variables produces no failed
   workflow run.** Every run in the resulting list is either successful or skipped.

4. **`harness-intent.yml` is a workflow file GitHub can parse.** It appears in the Actions run
   list under its workflow name, not under its file path, and its jobs are addressable. (Its
   current 0-second failure named `.github/workflows/harness-intent.yml` is the observable
   defect.)

5. **Issue intake still works with no key.** An issue labeled `intent` produces a branch and a
   pull request containing a draft `intent.md` for that slug, generated deterministically, with
   `Status:` not equal to `approved`. This holds with the switch off. With the switch on, the
   model fills the draft instead, and the same PR is opened.

6. **The token-surface ratchet reports a verdict on a runner instead of crashing.** Run against
   `examples/scratch-py`, the cost job exits 0 on a machine that has neither `ruff` nor
   `pytest`, and prints a per-metric verdict for all five ratcheted metrics. Metrics that
   cannot be compared across differing toolchains are reported as skipped with the reason
   named; the remaining metrics are still graded.

7. **The ratchet still fails a real regression.** Behaviour 6 must not be reached by
   suppressing the check. On a comparable toolchain, a metric that exceeds its baseline by more
   than the configured tolerance still exits non-zero.

8. **The unit suite passes on a machine with no `claude` CLI on `PATH`.** The assertion that
   depends on that CLI is reported as *skipped with a stated reason*, not as passed and not as
   failed, and it still executes normally where the CLI is present.

9. **A model-invoking job added later without the guard fails the unit suite.** Adding a new
   workflow that calls `claude-code-action` without the guard from behaviour 2 turns the suite
   red, naming the offending file. This is what keeps behaviours 1–3 true after this change.

10. **Nothing that was proven before is unproven now.** The existing contract assertions about
    these files continue to hold unmodified: the PR review job is read-only and cannot declare
    a gate approved, the fix job can push but cannot approve or merge, the handoff and monitor
    workflows never call a model, and the eval job still requires authentication.

## Domain vocabulary

| Term | Meaning here |
|---|---|
| **Model-invoking job** | A workflow job that runs `anthropics/claude-code-action`, or passes `ANTHROPIC_API_KEY` into a step. Six workflows and one job of `harness.yml`. |
| **The switch** | The single repository variable of behaviour 2. A *variable*, not a secret: its value is not sensitive, and it must be readable in a job-level condition, which a secret is not. |
| **Skipped (job)** | GitHub never allocates a runner. Distinct from a job that starts and exits 0, which still burns minutes and still reads secrets. |
| **Skipped (metric)** | `baseline.compare` marks a metric `n/a` because the two sides are not comparable. Already implemented for `check_stop_tokens` when `errored_controls` differs. |
| **Errored (control)** | A control whose command could not run at all — "tool not installed". Distinct from `fail`, which means the tool ran and found something. |
| **The ratchet** | `harness baseline check`: five metrics of the token surface the harness controls, compared against a committed `baseline.json` at a tolerance. |

## Constraints and invariants

- **No credential is added to the repository.** Behaviour 3 must be reached with the secret
  store empty.
- **No check is weakened to reach green.** Behaviours 7, 9 and 10 exist to make this
  falsifiable rather than merely promised.
- **Zero dependencies.** The unit suite still runs on a cold clone with no `node_modules`. In
  particular, behaviour 4 cannot be proven by parsing YAML with a library; it is proven by
  GitHub accepting the file on a real push.
- **The switch must be readable where the guard is evaluated.** A guard that cannot be
  evaluated makes the workflow file invalid — which is defect (1) of the intent, and repeating
  it while fixing it would be the worst possible outcome.
- **The model workflow files keep their triggers and their permissions.** Gating changes when a
  job runs, not what it is allowed to do when it does.

## Visual design

Not user-facing. No design directory required.

## Policy concerns flagged

Raised here, not resolved.

1. **Automated PR review stops running, so Gate 3 becomes entirely human.** `claude-review.yml`
   is today the only thing that reads a diff against its approved spec and plan before merge.
   With the switch off, nothing does. The harness's deterministic gates (`plan-drift`,
   lifecycle integrity, the unit suite) still run, but the semantic review does not.
   *Resolved by: the repository owner.* Accepting this is a reasonable trade for a repo with
   one committer working on `main`; it would not be for a team.

2. **Law 9's governance trigger stops firing.** `docs/` describes the eval suite running on any
   diff that touches a steering surface as *the* governance model — the thing that replaces
   certification tiers. Gating the eval job off means a change to `CLAUDE.md`, a skill, or
   `harness.toml` merges with no eval evidence at all. The suite remains runnable locally with
   a key. *Resolved by: the repository owner.* If this matters more than the cost, the switch
   is the mechanism for turning it back on for a single PR.

3. **A repository variable is not an access control.** Anyone who can push a workflow file can
   also set or bypass the guard. The switch exists to stop accidental spend and red builds, not
   to stop a determined actor. Actual protection is branch protection plus the secret's own
   absence. *Resolved by: the repository owner.* Noted because it must not be mistaken for
   security.
