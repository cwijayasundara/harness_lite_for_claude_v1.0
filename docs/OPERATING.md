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
the stage run, and every verdict lands in `.aidlc/state/ledger.jsonl`. If you find yourself
running `harness check` by hand a lot, that is a finding: the hook is not firing, or it is not
firing where the work happens.

## Weekly — five minutes

```
.aidlc/bin/harness ledger              # what fired, how often, how slow
.aidlc/bin/harness baseline check      # did the token surface grow
.aidlc/bin/harness status              # artifact progress, SLA, playbook indicators
```

`status` now includes the playbook leading indicators: intent survival (accepted vs closed),
mean hours to a committed intent, spec commits after the first plan commit, first-pass review
share, and the latest eval pass rate when `evals/results/` exists. Missing clocks are
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
.aidlc/bin/harness ledger audit
```

It applies the kill criteria and prints a decision per control:

| Verdict | Meaning | Do |
|---|---|---|
| `earning-its-place` | fires on ≥5% of invocations | keep |
| `rarely-fires` | fires, but under 5% | ask whether the eval suite would have caught it anyway |
| `candidate-for-deletion` | 50+ invocations, never fired | **delete it, run the eval suite** |
| `unreliable` | errors on >10% of invocations | fix it or delete it — an erroring control is a lie |
| `insufficient-data` | under 50 invocations | wait. A verdict without evidence is not a verdict |

**Deleting is the point.** Remove the control, run `node evals/run.mjs`, and if nothing
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
- **Deployment:** allowlisted `preflight`, `deploy`, `status`, `verify`, `promote`, and `rollback` operations; short-lived identity;
  environment-specific approval; and a durable deployment receipt.
- **Monitoring:** a deterministic, unit-tested band detector that emits metric, baseline, band,
  observed value, timestamp, and source. The model diagnoses only after this trigger fires.

An adapter is complete only when staging proves deploy, status, verify, and rollback; a denied production
action is tested; and a synthetic band breach produces an incident and linked intent inside its
SLA. Until then Deploy and Maintain are contracts, not automated stages.

The core now exposes those seams without embedding provider credentials:

```
harness deploy preflight staging --artifact sha256:<digest>
harness deploy deploy staging --artifact sha256:<digest>
harness deploy status staging
harness deploy verify staging --artifact sha256:<digest>
harness deploy rollback staging
harness deploy promote production --from staging --artifact sha256:<digest> --approval CAB-1234
harness monitor detect --file bands.json
harness monitor ingest elevated-errors --file bands.json
harness contract status <slug>
```

`harness monitor detect` runs the `[monitoring].collect` argv when `--file` is omitted.
1σ logs only, 2σ writes an incident, 3σ (or a min/max breach) writes incident + intent.
The first 3σ also runs `[deployment].rollback` against **staging** when that argv is set;
a repeat detect for the same slug does not. Production is never the rollback target.
Empty collect is a no-op. This repo wires the example CI-failure collector, which prints
empty bands when GitHub is unavailable. `.github/workflows/harness-monitor.yml` stays
model-free and opens a PR; `.github/workflows/harness-diagnose.yml` may comment on that PR.
No lifecycle workflow creates or approves contracts. Monitor never pushes to `main`.

This checkout is one local plugin whose portable kernel lives under `.aidlc/`. The repo-root marketplace lists that kernel
only. Do not add policy skills or extra agents under `.aidlc/skills` or `.aidlc/roles` —
Law 5 is full. The kernel hook budget is also full (5/5); do not add a sixth kernel binding.

`[deployment]` commands are argv arrays, execute without a shell, receive the environment as their
final argument, and write a durable JSON receipt under `.aidlc/artifacts/deployment/`. Mutating
operations receive an immutable digest in `HARNESS_ARTIFACT_DIGEST`; promotion requires the same
verified digest. Production operations fail closed under the configured risk/approval policy.
See `DEPLOYMENT.md`. Monitoring input is deterministic JSON;
a 3σ or min/max breach creates the same-slug incident and intent. The model belongs after
that trigger, for diagnosis, never inside the detector.

### GitHub review adapter

`.github/workflows/claude-review.yml` runs on same-repository pull requests. It resolves exactly
one changed contract, requires committed contract approvals and behaviour evidence, caps the diff, and gives Claude only
read/search tools. Claude returns JSON under a schema; the harness validates paths, severities,
line numbers, recommendation consistency, duplicates, and the five-nit cap before rendering and
posting `review.md`. The result remains `draft`: only a human changes Gate 3 to `approved`.

Repository setup requires `ANTHROPIC_API_KEY` (or replacing that input with one of the action's
supported workload-identity providers). Fork PRs are deliberately excluded so untrusted content
cannot reach repository secrets. Run `harness-protection.yml` with an administration-read token
stored as `HARNESS_ADMIN_READ_TOKEN`; it verifies strict required checks, at least one approval,
stale-review dismissal, last-push independence, and enforcement for administrators. It audits
settings but never mutates them.

Comment-fix is a **separate** workflow (`.github/workflows/claude-fix.yml`). Mention
`@harness-fix` on a PR comment. The job may push commits. It must not approve or merge. Human
Gate 3 still owns `review.md` Status.

Non-engineer intent uses `.github/ISSUE_TEMPLATE/intent.yml` and `harness-intent.yml`. Cowork or
claude.ai should open that issue (GitHub connector), not a second artifact home. Claude Tag
and Slack incidents use the same issue. Design mocks go in `.aidlc/artifacts/design/<slug>/`.

`[guard].require_contract = true` makes product-file writes need a committed approved contract
that owns the path. This is the default. Production shell deploys without
`HARNESS_RELEASE_APPROVAL` are denied by the existing bash hook.

`harness lock tests --pattern tests/foo.py` is the test-integrity lock. `harness lock clear`
releases it. `harness worktree <slug>` adds an isolated git worktree for a disjoint contract slice.
`harness doctor --enterprise` prints the managed-settings checklist — git settings are not MDM.

Auto-accept of edits is allowed only after a contract is fully approved, the blast radius is owned, and
tests exist. It is not a harness mode.

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

## Running the sensors in a project's CI

A project declares the harness; it does not contain one. CI has no Claude Code and no plugin
cache, so it fetches the harness itself — at the exact commit the project recorded, never at a
moving branch, or CI and the laptop stop agreeing about what was checked.

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with: { node-version: '22' }
- name: Fetch the harness this project declared
  run: |
    commit=$(node -p "require('./.aidlc/harness-install.json').commit")
    repo=$(node -p "require('./.aidlc/harness-install.json').repository")
    git clone -q "https://github.com/$repo" "$RUNNER_TEMP/harness"
    git -C "$RUNNER_TEMP/harness" checkout -q "$commit"
    echo "HARNESS_HOME=$RUNNER_TEMP/harness/.aidlc" >> "$GITHUB_ENV"
- run: bash .aidlc/bin/harness check --stage commit
```

`HARNESS_HOME` is the shim's first resolution step, ahead of the plugin cache, precisely so CI
can point it at a checkout. If the record says `"commit": "unknown"` — which happens when the
harness was installed from an archive rather than a clone — pin a tag in its place and say so in
the workflow, rather than tracking a branch and hoping.

Upgrading is `harness init --into .` against a newer harness, which rewrites the record. The
diff shows the commit moving, so a harness upgrade is reviewed like any other change.

## Known limitation of running this on the harness repo

The harness currently governs its own development, which is a real test — v6's `.claude` was
invisible to its own graph *and* exempt from its own gates, and this is the inverse of both. But
a ledger built only here describes harness development, not the product work a team does. The
controls that matter to a team building services — `arch`, `coverage`, `typecheck` — will read
`skipped` here forever, because this repo has no toolchain to run them.

**So: install into one real product repo before the month-end audit**, or read the audit knowing
it only speaks for one unusual codebase. `harness init --into <repo>` takes about a minute.
