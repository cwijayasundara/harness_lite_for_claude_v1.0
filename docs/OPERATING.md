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
.aidlc/bin/harness status              # artifact progress, gates, current change
```

`status` reports where each open change sits in the chain, whether its approvals still bind,
and which change currently owns product writes. It measures no elapsed time: the playbook's
leading indicators were part of lean-v2's unreachable-kernel cut and are parked as a candidate
below. Close a change that will not enter Design by setting `status: closed` in its `intent.md`
and committing it.

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

**Deleting is the point.** Remove the control, run `node evals/run.mjs --live`, and if nothing
regresses it was not doing anything. That is the whole argument for having built the eval suite
first, and it is the mechanism v6 never had — which is why v6 could only grow.

## Automated product campaigns

`evals/products.json` contains two capable-model campaigns run by the existing eval runner.
The golden tasks stay in `evals/tasks.json`; the old transcript-driven ledger task has moved
out of that suite, with its historical expectation retained under `retired_tasks`.

The ledger campaign characterizes existing APIs, adds partial payments, reverses the overdue
rule, extracts storage and repairs an external rename before documenting the current product.
The service campaign creates HTTP endpoints, validates requests, persists data, changes a limit,
repairs a seeded parsing defect and handles an observed local storage failure. Session restarts,
rejected and stale approvals, a missing optional tool and independent seeded-defect review are
part of these sequences. Current requirements arrive one at a time.

The parent writes driver-authored draft proposals, then actual Claude Code reads them and pauses.
Scripted decisions use the ordinary approval function and committed artifact path. The parent
retains full-artifact receipts; all decisions say `simulated-test-driver`. This proves the
protocol, not human judgment. Planning cannot write product source; approved implementation
cannot edit artifacts, Git metadata, configuration or the plugin. Native tools exclude Bash;
public tests and hooks still execute inside the isolated container.

Docker mounts only the disposable product, a sanitized read-only plugin and session storage.
It does not mount this repository, private assertions, future scenarios, the Docker socket or
parent receipt state. The Claude container receives only the credentials needed for its model
connection; credentials are absent from network-disabled product/runtime containers. No host
paths beyond the explicit mounts or privileged runtime are granted. Private assertions run in
the parent and communicate with separate product processes through API/HTTP transports; they
are never imported beside untrusted product modules. Each runtime starts from a fresh source
snapshot. This is bounded container isolation, not a claim against container-runtime exploits.

Build once and run:

```sh
docker build -t lean-harness-product:2.1.263 - < evals/Dockerfile
HARNESS_PRODUCT_DOCKER=1 node --test test/product-trials.test.mjs
node evals/run.mjs --products --dry --max-suite-usd 20
node evals/run.mjs --live --products --id campaign-ledger --through 1 --max-suite-usd 3
node evals/run.mjs --live --products --max-suite-usd 20
```

`--through` is calibration only and is labelled in results. All attempts retain phase outputs,
actual model/CLI metadata, image and commit identities, simulated decisions, private check
results and replayable product snapshots under `.aidlc/evals/products/`. These results cannot
replace a full golden-suite result. Costs omitted by the provider stay unknown; allowances are
reserved conservatively. Timeouts and budget exhaustion remain incomplete. There are at most
two automatic product repairs per step. CLI and product containers have bounded lifetimes.

The deterministic Docker job runs on GitHub without model credentials. Actual product campaigns
are opt-in local runs using the configured generator/evaluator; they do not silently substitute
a cheaper model or claim success without credentials. Deployment is local and disposable.

## Independent review

Run `harness review --base <commit> --candidate <commit> --out <review.md>`. The command uses the
configured evaluator model, resolves explicit commits, exports a fresh candidate snapshot and
diff, disables customizations/MCP/hooks, and exposes only Read/Grep/Glob. The parent saves the
returned findings; CLI errors or missing output do not become a review. Run `harness check`
separately in the candidate checkout and preserve its results alongside the review. The evaluator
cannot run or modify tests through its tool set. It can still miss defects; its opinion does not
replace executable product acceptance.

Local `by`, `at` and `digest` fields are audit metadata, not authenticated human identity. New
plan approvals bind the spec body digest; older unbound records remain historical/local guidance
and cannot satisfy the external driver. Do not claim that committing a digest authenticates its
author. Similarly, the repository's legacy `test_quality` capability checks only text presence,
not assertion quality. Steering-file guards protect deliberate instruction/permission changes;
editing root CLAUDE.md does not invalidate an already loaded prompt mid-session. Reload it.

## When something goes wrong in production

1. Run `harness new <slug>`. It scaffolds the whole chain; record the deterministic signal, the
   impact and the mitigation in the `intent.md` it writes. The loop has re-entered Plan.
2. Fix it through the normal intent → spec → plan → diff → review chain.
3. **Keep the incident as an eval, permanently.** `harness new eval <slug>` writes the regression
   under `.aidlc/evals/pending/`; promote it into `evals/tasks.json`. One incident, one task,
   forever. This is the only sanctioned way the suite grows.
4. Only then ask whether a control would have prevented it.

## Stage SLAs

There are none, and there is no `[sla]` table. Elapsed-time targets went with lean-v2's
unreachable-kernel cut; what `harness status` reads the artifact chain for is gate *state*, not
elapsed time. It exits non-zero when an approved spec or plan has changed since it was approved,
and when an approved plan declares no files under `## Files`. A v2 approval also binds its
inputs: an uncommitted or edited `intent.md` invalidates the spec's binding, so saying approved
in a file nobody committed does not pass a gate. Use `--json` for CI or a weekly report. Flow
targets are a parked candidate below, not a thing this harness measures today.

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
the field is where the harness reads it (`a-named-behaviour-is-a-link`). And a spec approved
beside other open approved specs must declare its relation to each — `supersedes:` a behaviour
or `extends: <slug>` — so the question is asked at gate 1 rather than left for the agent to
volunteer (`a-change-declares-its-relation`, after four campaign runs in which the reversal was
described in prose every time and linked in none). An approved spec's behaviours do not grow:
re-approval is refused when `### B<n>` headings were added since the committed approved text,
because the amendment route was how run 6 reversed a promise under an `extends:` line that had
been true (`close-the-harness`). And approval is the human's gate: the pre-bash hook refuses
`harness approve` from an agent in every session — a human's shell runs no hook. Neither
`AIDLC_UNATTENDED` nor `AIDLC_EVAL` grants an exception. The registry, `.aidlc/harness.toml`, is a
protected path by default; a plan that names it still may change it.

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
harness status <slug>
```

This checkout is one local plugin whose portable kernel lives under `.aidlc/`. The repo-root marketplace lists that kernel
only. Do not add policy skills or extra agents under `.aidlc/skills` or `.aidlc/roles` —
Law 5 is full. The kernel hook budget is also full (5/5); do not add a sixth kernel binding.

### Review

The `harness review` caller saves `.aidlc/artifacts/<slug>/review.md`. The evaluator runs on
`[models] evaluator` with explicit snapshots and only Read/Grep/Glob. Checks run separately. Every finding cites a behaviour id from `spec.md`
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
3. **A skill** — only if both of the above failed, and only by deleting another skill once
   `[limits] skills` is at its ceiling. The ceiling lives in `harness.toml` and nowhere else.

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
- The playbook's metrics framework: time from idea to committed artifact, first-pass review
  share, rework cycles, change failure rate. The playbook's central claim is that the bottleneck
  *moves* to plan, review and deploy, and nothing here can currently see it move — the weekly
  question "did anything block you that should not have" is answered from memory. The timestamps
  are already in git and the artifact chain, so this is a read over data we keep rather than a
  subsystem. It stays parked until Law 11 is satisfied: a defect recorded while building a
  non-harness application through the harness, not another argument from this repository.

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

## Item 1 integration verification

`node evals/agent-mechanisms.mjs --live` loads the actual installed plugin for generator turns and checks
that SessionStart ran. Planning has read tools only; externally approved implementation gains
Write/Edit, with tests executed by the driver. The evaluator receives a separate safe-mode
session and explicit revisions. Evidence, including review findings, is saved under
`.aidlc/evals/smoke/`. This bounded mechanism test does not replace product campaigns.

The GitHub workflow runs deterministic tests, graph benchmarks and the Python example's verified
cost comparison on pushes. PR checks invoke no models. A manual dispatch with
`model_smoke=true` runs the focused live integration with a `CLAUDE_CODE_OAUTH_TOKEN` subscription secret; no credentials
means failure, not fabricated model evidence. The harness remains dependency-free; the Python
example installs its own pytest/reporting/ruff tools for its executable checks.

## Daily guidance after item 2

Intent records the problem and outcome; spec records observable behaviour, consequential design
and safeguards; plan records approach, file scope and proof; review records defects, evidence
and uncertainty. Read relevant source, tests and existing patterns before asking about facts
available in the repository. Ask only questions that could change a consequential decision.
A complete request needs no invented open questions or interview. Related behaviours may share
one intent and delivery boundary.

Within a current approved design and file scope, proceed with routine choices. Test maintenance
for renames, corrected test defects or approved requirements is legitimate when regression proof
remains equivalent or stronger. Do not weaken assertions to conceal a failure. Test locks and
external evaluation ownership still apply. Material design, behaviour, safeguard or scope
changes return to a human; artifact edits still invalidate approval digests.

`node evals/agent-mechanisms.mjs --live --guidance-base <commit>` compares the same bounded scenarios
using the configured capable generator with old and current guidance. The parent grades decisions
and executes two returned function expressions against undisclosed cases. It records questions,
proposed unnecessary stops/splits, boundary violations, product results, model metadata and cost
in `evals/evidence/smoke/guidance-comparison.json`. This is one paired decision sample, not an actual
product campaign or a measurement of workflow-repair turns. No model calls occur in unit tests.
