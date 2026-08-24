# Operating the harness

Phases 0–4 built it. This is the only phase that decides whether it was worth building, and it
has no exit criterion on purpose: it is the steady state.

**The rule for the next four weeks: add no controls.** Not a skill, not a hook, not a check. The
point is to find out what the twenty you have actually do. Every instinct will run the other way
— that instinct is what produced a 180-control harness with an outcome ledger containing zero
rows.

Write candidates down instead. There is a list at the bottom of this file.

---

## Daily — nothing

The hooks run themselves. `PostToolUse` checks each edit, `Stop` coalesces the graph refresh and
the stage run, and every verdict lands in `.claude/state/ledger.jsonl`. If you find yourself
running `harness check` by hand a lot, that is a finding: the hook is not firing, or it is not
firing where the work happens.

## Weekly — five minutes

```
node .claude/bin/harness ledger              # what fired, how often, how slow
node .claude/bin/harness baseline check      # did the token surface grow
node .claude/bin/harness status              # artifact progress, SLA, playbook indicators
```

`status` now includes the playbook leading indicators: intent survival (accepted vs closed),
mean hours to a committed intent, spec commits after the first plan commit, first-pass review
share, and the latest eval pass rate when `.claude/evals/results/` exists. Missing clocks are
`unmeasured`, never a fabricated zero. Close an intent that will not enter Design by setting
`Status: closed` and committing it.

Two questions:

1. **Did anything block you that should not have?** Write down which control and what you were
   doing. A false block is the most expensive failure a harness has, because the next thing
   people do is disable the control — or worse, keep it and route around the work.
2. **Did anything get through that a control should have caught?** That is a missing eval, not a
   missing control. Add the eval; decide about the control at the month end.

## Monthly — twenty minutes

```
node .claude/bin/harness ledger audit
```

It applies the kill criteria and prints a decision per control:

| Verdict | Meaning | Do |
|---|---|---|
| `earning-its-place` | fires on ≥5% of invocations | keep |
| `rarely-fires` | fires, but under 5% | ask whether the eval suite would have caught it anyway |
| `candidate-for-deletion` | 50+ invocations, never fired | **delete it, run the eval suite** |
| `unreliable` | errors on >10% of invocations | fix it or delete it — an erroring control is a lie |
| `insufficient-data` | under 50 invocations | wait. A verdict without evidence is not a verdict |

**Deleting is the point.** Remove the control, run `node .claude/evals/run.mjs`, and if nothing
regresses it was not doing anything. That is the whole argument for having built the eval suite
first, and it is the mechanism v6 never had — which is why v6 could only grow.

## When something goes wrong in production

1. Run `harness new incident <slug>` and record the deterministic signal, impact, and mitigation.
2. Run `harness new intent <slug>` and link it to the incident. The loop now re-enters Plan.
3. Fix it through the normal intent → spec → plan → diff → review chain.
4. **Add an eval to `evals/tasks.json`, permanently.** One incident, one task, forever. This is
   the only sanctioned way the suite grows.
5. Only then ask whether a control would have prevented it.

## Stage SLAs

The `[sla]` table in `harness.toml` defines elapsed-time targets. `harness status` reads the
artifact chain and git timestamps; it exits non-zero for an invalid transition, an uncommitted
approval, or a breached target. It finds the first commit where each status became `approved`,
so editing a file to say approved without committing it does not pass a gate. Unavailable clocks
are reported `unmeasured` rather than assigned invented dates.
Use `--json` for CI or a weekly report. These are flow SLAs, not estimates of coding effort.

## Provider adapter boundary

The core must not pretend to deploy or monitor a product. A production installation supplies:

- **SCM review:** read-only diff access, a bot identity, branch protection, and a way to publish
  the committed review finding set. Agent writes still arrive only through a PR.
- **Deployment:** allowlisted `deploy`, `status`, and `rollback` operations; short-lived identity;
  environment-specific approval; and a durable deployment receipt.
- **Monitoring:** a deterministic, unit-tested band detector that emits metric, baseline, band,
  observed value, timestamp, and source. The model diagnoses only after this trigger fires.

An adapter is complete only when staging proves deploy, status, and rollback; a denied production
action is tested; and a synthetic band breach produces an incident and linked intent inside its
SLA. Until then Deploy and Maintain are contracts, not automated stages.

The core now exposes those seams without embedding provider credentials:

```
harness deploy deploy staging
harness deploy status staging
harness deploy rollback staging
harness deploy deploy production --approval CAB-1234
harness monitor detect --file bands.json
harness monitor ingest elevated-errors --file bands.json
harness handoff --write
```

`harness monitor detect` runs the `[monitoring].collect` argv when `--file` is omitted, writes
incident + intent on a numeric breach, and no-ops when collect is empty. `.github/workflows/harness-monitor.yml`
schedules it. `.github/workflows/harness-handoff.yml` turns a committed intent/spec approval
into a PR that holds the next draft. Neither workflow invokes a model; neither pushes to `main`.

Policy skills install from the repo-root marketplace (`.claude-plugin/marketplace.json`) as
`org-policy` (`secure-api`, `ux-standards`, and a read-only `policy-reviewer` agent). They stay
out of `.claude/skills` and `.claude/agents`. Changing them does not require raising Law 5.
The kernel hook budget is full (5/5); do not add a sixth kernel binding.

`[deployment]` commands are argv arrays, execute without a shell, receive the environment as their
final argument, and write a durable JSON receipt under `.claude/artifacts/deployment/`. Production
operations fail closed without an approval identifier. Monitoring input is deterministic JSON;
only a numeric min/max breach creates the same-slug incident and intent. The model belongs after
that trigger, for diagnosis, never inside the detector.

### GitHub review adapter

`.github/workflows/claude-review.yml` runs on same-repository pull requests. It resolves exactly
one changed plan, requires committed spec and plan approvals, caps the diff, and gives Claude only
read/search tools. Claude returns JSON under a schema; the harness validates paths, severities,
line numbers, recommendation consistency, duplicates, and the five-nit cap before rendering and
posting `review.md`. The result remains `draft`: only a human changes Gate 3 to `approved`.

Repository setup requires `ANTHROPIC_API_KEY` (or replacing that input with one of the action's
supported workload-identity providers). Fork PRs are deliberately excluded so untrusted content
cannot reach repository secrets. Run `harness-protection.yml` with an administration-read token
stored as `HARNESS_ADMIN_READ_TOKEN`; it verifies strict required checks, at least one approval,
stale-review dismissal, last-push independence, and enforcement for administrators. It audits
settings but never mutates them.

The review workflow deliberately stops at validated findings. It does not grant a review agent
write access merely to reproduce the playbook's comment-fix loop: any future fixer must be a
separate workflow with no approval capability, scoped write permissions, and changes delivered as
a new commit through the same required checks. Read-only review plus human approval is the safe v1
boundary.

## When a review finding keeps recurring

In this order, and stop at the first that works:

1. **A line in `CLAUDE.md`** — under "Things this project gets wrong", added the *second* time,
   never the first. Cheapest possible fix, costs a few tokens per session.
2. **A check** — if the line does not hold, make it mechanical. Needs a `why:` naming this
   finding.
3. **A skill** — only if both of the above failed, and only by deleting another skill. The
   budget is full at 12/12.

Most things stop at step 1. That ordering is the single most important habit in this document.

---

## Candidate controls — parked until the audit says otherwise

Write them here rather than building them. Each needs the ledger to justify it.

- `arch` verb backed by the graph's cycle detection. The machinery already exists
  (`graph query cycles`); it is not wired to a stage because nothing has yet shown that cycles
  appear in this codebase faster than they are noticed.
- A `pack`-aware read guard that nudges whole-file reads toward `harness pack`. Only worth it if
  the ledger shows the token surface growing despite the pack existing.
- Coverage as a ratcheted metric. Needs a project where coverage is actually measured first.

## Known limitation of running this on the harness repo

The harness currently governs its own development, which is a real test — v6's `.claude` was
invisible to its own graph *and* exempt from its own gates, and this is the inverse of both. But
a ledger built only here describes harness development, not the product work a team does. The
controls that matter to a team building services — `arch`, `coverage`, `typecheck` — will read
`skipped` here forever, because this repo has no toolchain to run them.

**So: install into one real product repo before the month-end audit**, or read the audit knowing
it only speaks for one unusual codebase. `harness init --into <repo>` takes about a minute.
