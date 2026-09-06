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

A control that never fires is a deterrent standing at its limit or a control that checks
nothing, and rows alone cannot tell them apart. `[deterrents]` in `harness.toml` maps a control
to the test that plants the defect its `why:` names; the audit checks the file exists and names
the control, and reads `deterrent — keep — proven by <file>` instead of `never-fired — decide`.
Telemetry rows (`graph-refresh`) are not judged, and a name nothing reaches that has recorded
nothing for a week is listed once as `Retired:` and never asked about again.

```
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

## Campaigns — before a release, not a per-change gate

The 22-task suite grades one prompt against one fixture. A campaign grades the harness across a
product's whole arc: `evals/tasks.json` tasks with a `steps` array run several sprints against
the *same* staged working copy, in order, so later sprints inherit what earlier ones built —
including their mistakes. One ships with the harness, and it is the integration test:

`campaign-ledger` — five sprints against one brownfield working copy: an invoicing ledger that
already has customers, invoices, a late-fee module with a defect no sprint mentions, one smoke
test and no artifact chain.

1. **Adopt.** Characterise what exists, then add two behaviours. The first product write needs
   an approved plan, and the fee module must survive untouched.
2. **Extend.** Partial payments. Sprint 1's tests are edited, not replaced.
3. **Contradict.** A paid invoice is never overdue, which reverses a behaviour sprint 1 approved:
   the new spec records `supersedes:`, and every product file changed belongs to the current
   change's plan — not to an earlier sprint's.
4. **Refactor.** Storage moves to its own module with no behaviour change. What the agent does
   to the contract is recorded, not prescribed.
5. **Describe.** `docs/PRODUCT.md` states what the ledger does today, graded against the folded
   `supersedes:` chain.

Run it with `node evals/run.mjs --id campaign-ledger --require-auth`. It is one multi-turn build,
not one prompt — bounded at a dollar and six minutes per sprint — which is why it is not in
`--stage commit` and CI does not run it on every push. Run a campaign
before a release, or whenever a change touches how the harness carries context or approvals
across a plan boundary — the two things a single-prompt task cannot exercise at all.

A failure here is a harness defect, not a task to patch in place: record it as its own intent
under Law 11, the same as any other defect found by building something rather than by reasoning
about it. Fixing it is a separate change with its own gates.

**A campaign runs with no human present, so it cannot obey the human gate — it is given a
different, visibly marked one.** `evals/lib/invoker.mjs` sets `AIDLC_UNATTENDED` on the `claude`
process it spawns for a campaign step only, and *deletes* it from the child's environment for a
single-prompt golden task — stripped rather than merely not-added, so an operator who happens to
have `AIDLC_UNATTENDED` exported in their own shell cannot leak it into the golden suite. No file
inside the staged working copy can turn it on either; the signal only ever comes from the runner.
What that does not cover is a person running `harness approve` by hand in such a shell: the three
readers below honour the variable wherever it is set, which is why a discarded `--by` is reported
to stderr.

Three places read it, and nothing else: `approve()`, which forces `by: unattended-eval-run`
regardless of what
`--by` was given while every other precondition — committed-first, plan-after-spec, the body
digest, `stale-approval` — still applies exactly as it does today; the `SessionStart` hook, which
tells the agent it may approve its own gates and where `harness new <slug>` writes; and
`harness status`, which repeats the same notice for an agent that runs it. If a person's own
`--by` reaches `approve()` while the variable is set, it is discarded and reported to stderr, not
silently substituted. The results JSON of a campaign run lists every artifact approved this way.
In a real repository `AIDLC_UNATTENDED` is never set by hand: an artifact stamped
`unattended-eval-run` there means something went wrong.

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

## A gate reads content too

Every precondition above is about an artifact's *state* — committed, ordered, digest unchanged.
`approve()` also reads what the artifact *says*: it refuses a `spec.md` or `plan.md` still
carrying the scaffold `harness new` writes (an untouched placeholder, or a `### B<n>` behaviour
that is still the bare `Given ... / When ... / Then ...`), and it refuses a plan whose Proof table
is missing a row for a behaviour its spec claims — presence of a row, nothing stronger, since a
plan may legitimately name a test it has not written yet. `--anyway "<reason>"` proceeds past
either refusal and records `approved_anyway: <reason>` in the approval frontmatter; the flag with
no reason is refused, because the reason is the point. Neither check applies retroactively — an
artifact approved before this existed stays approved when read; only a fresh `approve()` call
enforces it.

## A spec can be superseded

A later change may reverse a behaviour an earlier approved spec claims. Rather than editing that
spec — which would fire `stale-approval` and re-open a gate on a change that is already merged, for
a fact discovered by someone else — the superseding spec records `supersedes: <slug>#<behaviour-id>`
in its own frontmatter, checked at approval time the same way any other content is: the named slug
must exist, its spec must be approved, and the named `### B<n>` must be in it. The superseded spec
is never touched — its `status`, `by`, `at` and `digest` all stand, because it is evidence of what
was actually promised, and a link only takes effect once the superseding spec is itself approved.
`harness status` and `SessionStart` both name a superseded behaviour and what superseded it, so a
reader (or an agent that has just started a session) can tell without reading every change that
came after. And a spec whose prose names an approved behaviour by id (`<slug>#B<n>`) without
linking it is refused at approval: an agent that has written the id has made the judgment, and
the field is where the harness reads it (`a-named-behaviour-is-a-link`).

## Provider adapter boundary

The core must not pretend to deploy or monitor a product. A production installation supplies:

- **SCM review:** read-only diff access, a bot identity, branch protection, and a way to publish
  the committed review finding set. Agent writes still arrive only through a PR.
- **Deployment:** the project owns it. The harness has no deployment port, no receipts and no
  approval ladder, because it never ran one: lean-v2 cut 2 deleted 190 lines and a Docker Compose
  provider that no ledger row and no contract's evidence had ever touched. What the playbook
  requires of you is unchanged — a human authorizes a release, and branch protection is the gate.
- **Maintain:** a deterministic script watches the metric and writes an intent on a breach. That
  is `examples/maintain/band-to-intent.mjs`, fifty lines, project-owned. 1σ logs, 2σ diagnoses
  read-only, 3σ writes the intent. Detection stays model-free; an agent reads the intent afterwards.

Both are adapter contracts, not automated stages, and they say so. The code returns to the kernel
when a service running behind it produces a defect, under Law 11 — not before.

```
your-metric-command | node examples/maintain/band-to-intent.mjs
harness contract status <slug>
```

This checkout is one local plugin whose portable kernel lives under `.aidlc/`. The repo-root marketplace lists that kernel
only. Do not add policy skills or extra agents under `.aidlc/skills` or `.aidlc/roles` —
Law 5 is full. The kernel hook budget is also full (5/5); do not add a sixth kernel binding.

### Review

The `evaluator` agent writes `.aidlc/artifacts/<slug>/review.md`. It runs on the model named by
`[models] evaluator`, in a worktree it did not write to, with Bash so it can run the checks and
no Write or Edit so it cannot make them pass. Every finding cites a behaviour id from `spec.md`
or a named pass from `.aidlc/policies/review.md`; a finding that cites nothing is an opinion.

A `changes-requested` review returns to `implement` at most twice. A third automated repair on
the same finding is a loop, not a fix, and the human decides instead. The review artifact stays
`draft`: only a human moves Gate 3, and only branch protection enforces it.

lean-v2 cut 8 removed the GitHub review adapter, the protection audit and five workflows. They
were a second implementation of the passes above, gated behind a key the repository did not have,
so they never ran. What replaces them is the agent plus branch protection, which is what the
playbook asks for.

`[guard].require_contract = true` makes product-file writes need the *current change's* committed
approved plan to name the path in `## Files`. The current change is the open change whose spec
was approved most recently; a closed change (`status: closed` in its `intent.md`) or a draft spec
is never current, and no other change's plan is consulted. That is `a-diff-belongs-to-one-change`:
three times a write went through on an older plan's authority — once after that plan's own change
had been refused at the gate — because ownership answered "is this path claimed?" instead of "is
it claimed by the change being made?". `scope-drift` reads the same function, so the guard and
the check cannot disagree. Closing a change is how it stops being current; `harness status` and
`SessionStart` both print `current:` so the answer is never a surprise. And writing a spec is
declaring work: while any open change has a filled-in spec that is not yet approved, no product
file may change and the refusal names it (`a-draft-is-a-declaration`, from the sprint that
drafted a spec, approved nothing, and edited code under the previous sprint's plan). A scaffold
left by `harness new`, placeholders and all, declares nothing. The same holds for an approved
spec or plan of an open change that has been edited since: its `stale-approval` waits at its
gate and no product file changes until it is re-approved or restored
(`an-edited-approval-awaits-its-gate`, from the sprint that appended behaviours to the previous
sprint's approved spec and was then governed by the sprint before that). This is the default.
Shell releases to a live environment without `HARNESS_RELEASE_APPROVAL` are denied by the bash hook.

Auto-accept of edits is allowed only after a plan is approved, the blast radius is owned, and
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
