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
cannot edit artifacts, Git metadata, configuration or the plugin.

**There is no sandbox.** Product trials used to run a coding agent inside a container that mounted
only the disposable product, a sanitized read-only plugin and session storage. That container was
removed by `the-harness-needs-no-container`, and nothing replaced it. No OS-level boundary is
claimed anywhere in this repository, and none exists.

**One thing still runs a real agent on this machine, and it is not a product trial.**
`evals/agent-mechanisms.mjs` invokes the CLI directly with `Read,Grep,Glob` and, for its edit
phases, `Write,Edit` under `acceptEdits` — never `Bash` — against a disposable fixture in a
temporary directory. It bypasses `evals/lib/invoker.mjs` entirely, so the refusal below does not
apply to it, and CI runs it behind `workflow_dispatch` with a subscription token. It predates this
change and was deliberately left alone: the spec scopes out the harness's own non-product
invocations. It is written down here so that "a live product trial refuses to start" is not
misread as "nothing runs an agent".

The consequence is deliberate and enforced rather than documented and hoped for: a live product
trial **refuses to start**. `evals/lib/invoker.mjs` throws when handed a sandbox, because the only
alternative would be running an agent with Write, Edit and Bash directly on the operator's
machine. Comparison runs record `credentials_or_isolation_unavailable` for the same reason.
Restoring live trials means restoring a boundary first.

What still runs, on any machine, with no container runtime installed:

```sh
node --test test/*.test.mjs
.aidlc/bin/harness check --stage commit
node evals/run.mjs --products --dry --max-suite-usd 20
```

The deterministic suites are the whole of what executes. They drive a fake invoker, make no model
calls and need no credentials. Private assertions run in the parent and communicate with separate
product processes over API and HTTP transports; they are never imported beside untrusted product
modules. Each runtime starts from a fresh source snapshot. Those properties are about keeping
grading honest, not about containment, and they are not a security boundary.

## What a session is told, and what a turn ends with

The SessionStart payload is two halves. Everything down to the `contract:` line is identical from
one session to the next in a repository nobody has touched — the project, the check command, the
budget, the map's hubs, the scope rule — and everything after it moves: a stale graph, a noisy
control, which change is selected, what has been superseded. A prompt prefix is cached only while
it stays byte-identical, so a volatile line above the boundary re-sends every line below it. Add a
line to the stable half deliberately; add one to the volatile half freely.

The Stop hook runs `stop_hook` — `fast`, plus the tests that name what the turn touched — and not
the whole suite. `[capabilities].test_changed` is the narrowed command (`{files}` is substituted
with the selected tests); unset, it is `skipped` like any other capability a project has not
configured, and never a silent fall back to the full run. The full suite belongs to
`harness deliver`, once per iteration, and `harness check --stage stop` stays one command away.

## Every finding says what to do, and every suppression reaches the merge

A finding carries `file`, `line`, `rule`, `message` and `fix`. The `fix` is one sentence written
for the model rather than for a changelog: it names the judgment to make, and where the rule might
be wrong it says so — "make a judgment call on this line; fix it, or suppress it with a `why:` on
the same line if the rule does not apply here". A finding with no fix line is one the reader has to
go and research before acting, which is how an accurate control still gets ignored. Every
normaliser fills it; a tool that supplies its own advice (ruff's autofix message, mypy's hint) says
that instead of the generic sentence.

`tamper` refuses a suppression with no `why:` and permits one that has it. Permitting it silently
would mean nobody ever reads the reason, so the reasoned ones are collected and `harness deliver`
lists them under `## Suppressions` on the pull request, with the file, the line and the reason —
in front of the person who can disagree with one before it merges rather than after.

## Opt-in verbs: mutation, SAST, layering

Three verbs the harness knows how to read and will not run for you. Each is slower or noisier than
a commit-stage control should be until a project has decided it is worth the wait, so all three
ship empty and none is in a default stage. What the harness supplies is the part a project cannot:
one finding schema, so a surviving mutant, a semgrep hit and a broken layer rule reach the model in
the same shape as a lint error.

| verb | command | format |
|---|---|---|
| `mutation` | `npx stryker run --incremental --reporters json > /dev/null && cat reports/mutation.json` | `mutation` |
| `sast` | `semgrep --config auto --json` | `semgrep` |
| `layers` | `npx depcruise src --output-type json` | `depcruise` |
| `layers` (Python) | `lint-imports` | `import-linter` |

`mutation` reads the mutation-testing-elements JSON schema — what Stryker writes natively and what
the other emitters in that ecosystem target. One schema rather than one parser per tool: a
mutation tool that cannot emit it should write that schema, which is a smaller ask than a parser
this repository has no way to test. A surviving mutant is a finding with a file and a line; a
`NoCoverage` mutant is a different finding saying no test executed the line at all; a killed
mutant is not a finding, because the suite did its job.

`layers` reasons about modules, not lines, so its findings carry a file and line 0. That is
reported rather than invented: a rule about "this module may not import that one" has no line to
point at.

Add one to `commit` when the project is ready for it — that is a decision about how long a commit
may take, and it belongs to the project. `examples/scratch-ts` is the worked example: `layers`
runs in its `drift` stage, and `mutation` is configured and reachable from no stage at all.

## Coverage ratchets, and every behaviour names its proof

`test_quality` is gone. It counted `test(` occurrences in files whose names looked like tests —
it could not tell a suite from a file of comments, and across roughly ninety recorded runs it
never fired. Two smaller and truer controls replace it.

**The coverage ratchet.** `harness baseline capture` runs the project's `coverage` verb and records
`coverage_lines_pct` from whatever it wrote — `lcov` (node, vitest, most JavaScript toolchains) or
`coverage.py` JSON (`pytest --cov`). `harness baseline check`, and the `baseline` control in the
commit stage, fail when it drops by more than `coverage_drop_pct` (default 1.0) percentage points.
It is graded in points rather than as a ratio because a 1.10 ratio would let nine points go
unnoticed. A project with no coverage verb, or a coverage run that failed, records `null` and is
reported unmeasured — the repair for "we cannot see it" is to configure it, never to fail a build
that says nothing about the change.

**The proof check.** `proof` reads every promise spec and every plan's `## Proof` table: a
behaviour with no row, or a row naming a test file that no longer exists or no longer contains the
identifier it claimed, is a violation. A row that names runtime evidence instead of a test is
reported unverifiable, never a violation — the plan skill permits it, and a manual check is
honest when the thing genuinely cannot be automated. A behaviour retired on purpose is retired by
removing it from `spec.md`. This check used to live in the eval library, where it ran only inside
a graded eval; it is a property of a repository at commit time, and that is where it runs now.

## The registry fills itself where it can

`harness init` reads the project's own manifests — `package.json`, `tsconfig.json`, an eslint
config, `pyproject.toml`, `requirements.txt`, `go.mod` — and writes the capability verbs it can see
the tooling for. It reads what the project *declares*, never what happens to be on the machine, so
two installs of one repository produce the same registry and a laptop with `mypy` on PATH does not
configure a check CI cannot run. `harness init --detect` prints what it sees and exits.

What it cannot see stays empty, and an empty verb is `skipped` — never `failed`. Detection fills an
empty verb and never overwrites a configured one: a hand-written command is a decision, and
re-running `init` must not undo it. A verb emptied deliberately stays empty; `--redetect` fills it
again, and `--no-detect` skips detection entirely.

For TypeScript it writes `tsc --noEmit`, `eslint`, `prettier` when declared, the project's test
runner (`vitest` if declared, otherwise `tsc` plus `node --test`), node's built-in coverage in lcov
form, and `npm outdated`. For Python: `ruff format`/`ruff check`, `mypy`, `pytest`, `pytest --cov`,
and `pip list --outdated`. A Go module is recognised and reported; the harness ships no Go verb set
yet, and a stack it cannot fill is named rather than guessed at.

The `lint` verb assumes the project's eslint config carries the three complexity rules the harness
documents, at these thresholds: `complexity` 10, `max-lines-per-function` 60, `max-params` 4. They
are errors, not warnings — `harness check` grades a verb by its exit code, and a rule that only
warns is a rule the loop never has to answer for. The harness does not write them into anyone's
eslint config; that file belongs to the project. `examples/scratch-ts/eslint.config.js` is the
worked example.

Two verbs the detector never fills: `arch`, which has no generic tool (a project adds a layering
command — see the opt-in verbs), and `secrets`, which needs no command because the harness's own
scanner runs when it is empty.

## The delivery engine: `harness deliver`

`harness deliver <slug> --live` drives the seven phases between the plan approval and the merge
decision, so a human stops relaying one command's output into the next:

1. `implement` — the `implement` skill on the generator, scoped to the plan's `## Files`.
2. `check-stop` — `harness check --stage stop`. One repair turn on failure, then stop.
3. `refactor` — one generator turn under green checks, no behaviour change.
4. `review` — `harness review` with the scoped export.
5. `repair` — at most `max_repairs` turns on Blocking and Important findings, each confirmed by a
   fresh review. The second attempt escalates to the judgment model.
6. `check-commit` — `harness check --stage commit`.
7. `pr` — `gh pr create` with the `Harness-Change:` line, the approval rows, the review verdict,
   the export scope and the ledger invocation id.

Each phase is recorded in `.aidlc/state/deliver/<slug>/phases.json` before it starts and after it
ends, so an interrupted run resumes from the phase that had not completed rather than paying for
the ones that had. `harness deliver <slug> --status` prints that record. If the approved plan's
digest moved while the run was stopped, the driver refuses to resume: the authority it was
executing under is gone, and a fresh run against the new plan is the way forward.

`[deliver]` in `harness.toml` bounds it — `max_minutes`, `max_usd`, `max_repairs`. The driver
stops and names the bound rather than exceeding it; a bound is not a verdict on the change, and
the state it leaves is resumable. An unreported model cost reserves its full remaining allowance
rather than counting as free. `--dry` prints the phases, the models and the bounds and spends
nothing; without `--live` the driver refuses to start.

What the driver cannot do is as important as what it does. It grants no gate: under
`[gates] = "human"` it refuses to start without the approval, under `advisory` it carries the gap
onto the pull request, and only under `auto` does it record the approval that setting already
gave — as `approved_by: policy` with a digest, never as a person. It does not write
`status: approved` into a review artifact, so a delivered change's next step is still `implement`
and not `merge`. And it does not merge: the third gate is the human's, against branch protection.

## Independent review

Run `harness review --base <commit> --candidate <commit> --out <review.md>`. The command uses the
configured evaluator model, resolves explicit commits, exports a fresh candidate snapshot and
diff, disables customizations/MCP/hooks, and exposes only Read/Grep/Glob.

The snapshot is scoped to the change: the current change's approved `## Files`, the modules the
graph shows importing them, the tests naming them, and the change's own artifact directory. The
diff is never scoped. `--full-tree` exports everything instead; a change with no approved plan
selected falls back to the full tree on its own. The wall-clock allowance is derived from the
diff — 300 s plus 2 s per KB, capped at 900 s — and `--timeout <ms>` overrides it. A review that
outlives its allowance is not thrown away: the findings the CLI streamed are written with
`Status: incomplete` and the reported spend, the command exits 1, and the caller decides whether
to re-run with a longer allowance. Reported cost is a usage estimate, not an invoice. The parent saves the
returned findings; CLI errors or missing output do not become a review. Run `harness check`
separately in the candidate checkout and preserve its results alongside the review. The evaluator
cannot run or modify tests through its tool set. It can still miss defects; its opinion does not
replace executable product acceptance.

Local `by`, `at` and `digest` fields are audit metadata, not authenticated human identity. New
plan approvals bind the spec body digest; older unbound records remain historical/local guidance
and cannot satisfy the external driver. Do not claim that committing a digest authenticates its
author. Steering-file guards protect deliberate instruction/permission changes;
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

## Story intake: one document is the single source

`harness new --from <path.md | https-url> [--split] [--revision <id>]` turns a PRD or a tracker
story into a change, or into a decomposed set of them.

The kernel reads a path or takes a URL string. It has no tracker client, no credential and no
network call, and it must not acquire one. To intake from a tracker, the agent reads the issue
through the project's own MCP server, writes what it read to a file in the repository, commits
it, and passes that path — so the document a change was decomposed from is a committed artifact a
reviewer can read, at a revision the approval binds to. At PR open the driver (G09) writes one
comment back to the tracker through that same MCP server, carrying the PR URL and the candidate
SHA.

**The single-source rule.** The document is the inventory; the changes are the work. Keep the
complete acceptance criteria in the source document and nowhere else — not copied into a parent
change, not maintained as a second registry. Each child change names the same `parent` initiative
and the same `source`/`source_revision`, and that triple is what groups them: `coordination()`
reads the source at that exact commit to report which criteria no child has mapped. Two copies of
an inventory disagree the first time one is edited, and then nothing can say which is current.

`--split` decomposes on `## Story` sections, or failing that on an `## Acceptance criteria` table
whose Criterion IDs carry a `<group>:` prefix. A document with neither is one change; asking for
`--split` anyway is refused rather than guessed at. A story may state its order with a
`Depends on: <other story>` line, which becomes `depends_on` on that change's plan; a name that
matches no sibling is reported as `UNRESOLVED` rather than dropped.

## Provenance is optional, and binding once declared

An intent may name where its requirements came from:

```yaml
source: requirements.md
source_revision: <exact commit>
```

Both or neither. With them, the spec approval records `source_kind`, the resolved revision and a
digest of the document, and `read()` reports a stale approval if the declaration later changes —
the binding pins a revision, so later edits to the file itself do not invalidate it. Without
them the approval records `source_kind: unbound` and `harness status` prints `binding: spec
unbound`, which is a fact about the change rather than a defect in it.

This used to be mandatory. It cost more than it bought: a control-band breach, a PRD paragraph
and an incident report are all legitimate origins, and none is a committed blob at a revision
anybody can name in advance — `examples/maintain/band-to-intent.mjs` writes `status: draft` and
nothing else, so the maintain edge could not reach its own first gate. The `## Requirements`
table follows the same rule: validated when present, not demanded when absent, because a table
invented to satisfy a checker records nothing.

Unchanged: `approve` still refuses an uncommitted artifact, a half-declaration (`source` without
`source_revision`, or a path that does not resolve to a committed file) is still refused, and a
present Requirements table must still cover every numbered behaviour exactly once.

## A gate is a policy, not a constant

`[gates]` in `harness.toml` sets each gate's mode. The default, for a project that says nothing,
is `advisory` for `spec` and `plan`:

```toml
[gates]
spec  = "advisory"   # human | advisory | auto
plan  = "advisory"
merge = "human"      # the only permitted value
```

**`human`** is the enforcing gate. A product write outside the approved plan's `## Files`, or
before the spec is approved, is refused at the Write and Bash hooks; `scope-drift` fails the
commit stage; `harness status` prints `ERROR` and exits 1.

**`advisory`** reports the identical judgment and lets the loop continue. The hook emits an
`additionalContext` warning instead of a denial and records a `warn` row rather than a `fail`;
`scope-drift` returns `warn`, so the findings are on the report with their file and rule while
`ok` stays true and the PR check annotates rather than fails; `harness status` prints
`ADVISORY` rows and exits 0. Nothing is hidden — the merge decision reads what the gate said.

**`auto`** is for the driver. It records the approval itself, writing `approved_by: policy` and a
`policy_digest` covering the gate's configured mode, so an approval justified only by "the
configuration said so" says what the configuration was. `harness approve <slug> <kind> --policy`
is refused in any other mode, and the `approve-is-the-humans` hook rule still refuses the agent's
own shell in every mode — the driver reaches this through the library, never through Bash.

Relaxing a gate relaxes exactly the gate. Destructive-command rules, `protected-path`,
`prefix-cache`, `tamper`, `secrets` and `approve-is-the-humans` are unaffected by any mode, and
`unkept-proof` — an approved plan naming a test that does not exist — still fails, because that
is a broken promise inside a gate that was already given rather than a gate still waiting for an
answer.

Choose `human` when the repository's merge protection is the only other reader of these
decisions. Choose `advisory` when a code-owner review on the PR is what actually gates the merge
and the in-loop refusals are costing more than they catch. Measure it: `harness ledger audit`
separates a caught mistake from a false block by rule, and a `warn` row is what a relaxed gate
leaves behind.

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

The harness source repository deliberately does not activate its own Claude hooks; consumer
fixtures and product trials provide the real test. A ledger built only here would describe
harness development, not the product work a team does. The
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
