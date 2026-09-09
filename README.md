# Claude Harness Lean

A lean AIDLC harness for Claude Code. You describe what you want in plain English; Claude walks
it through `intent → spec → plan → code → review`, stopping at three human approval gates, with
deterministic checks (tests, lint, secrets, plan scope-drift) enforced by hooks.

Works with any language. Zero dependencies — no `npm install`, ever.

---

## Requirements

- Git
- Node.js 18+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview)

---

## Setup (5 minutes)

### 1. Clone this harness somewhere permanent

```bash
git clone https://github.com/cwijayasundara/harness_lite_for_claude_v1.0.git ~/lean-harness-cs-v1
```

### 2. Go to your project — it must be a git repo

```bash
cd /path/to/your/project
git init          # only if it isn't one already
```

The harness reads git history for approvals and scope. Without a git repo, most commands
degrade or fail.

### 3. Install the harness into your project

```bash
node ~/lean-harness-cs-v1/.aidlc/bin/harness init --into .
```

This creates an agent-neutral control plane plus the Claude adapter declaration:

```
.aidlc/
  harness.toml          ← the one file you edit
  instructions.md       ← canonical instructions shared by agent adapters
  policies/review.md    ← canonical review policy
  harness-install.json  ← generated; names the marketplace, plugin and exact commit
  bin/harness           ← generated shim; finds the harness and runs it
  artifacts/<slug>/     ← intent.md, spec.md, plan.md, review.md per change
  state/                ← local, gitignored
.claude/
  CLAUDE.md             ← generated Claude projection; do not edit
  settings.json         ← generated; enables the Claude adapter plugin
```

Note what is **not** there: no copy of the harness. Your project declares which version it uses;
it never carries one. That is what keeps every member of your team on the same harness, and what
stops a project quietly editing the controls that govern it.

Commit `harness-install.json` along with the rest. It does two jobs: the budget reads it to count
the skills and agents the plugin delivers, which are not inside your project, and CI reads it to
fetch the exact harness commit you installed.

`init` is safe to re-run.

### What goes into a new repository

Scaffold with `harness init --into /path/to/project`; do not copy this repository wholesale.
The scaffold contains eight files: the project config, canonical instructions, review policy,
`.aidlc/.gitignore`, the CLI shim and install record, plus `.claude/CLAUDE.md` and
`.claude/settings.json`. Its artifact and runtime-state directories start empty. Your existing
project instructions and configuration are preserved when you re-run the installer.

The executable checks, skills and hooks come from the shared Claude plugin installed below.
The scaffold is not a standalone copy of that plugin. This repository's development history,
tests, evals, reports, examples and credentials are never copied into the new project.

### 4. Tell the harness how to build your project

Open `.aidlc/harness.toml` and fill in the eight capability verbs with your project's own
commands. **This is the step people skip, and nothing works until it's done.** Any verb left
empty is reported as *skipped*, never as *passed*.

Python example:

```toml
[project]
name = "my-project"

[capabilities]
fmt       = "ruff format {files}"
lint      = "ruff check {files}"
typecheck = "mypy {files}"
test      = "python3 -m pytest -q"
coverage  = ""
arch      = ""
secrets   = ""          # empty = use the built-in secret scanner
deps      = ""

[formats]
lint      = "ruff"
typecheck = "mypy"
test      = "pytest"
```

TypeScript example:

```toml
[capabilities]
fmt       = "prettier --write {files}"
lint      = "eslint {files}"
typecheck = "tsc --noEmit"
test      = "npm test"

[formats]
lint      = "eslint"
typecheck = "tsc"
```

Verify it took:

```bash
.aidlc/bin/harness doctor
```

You should see `set` next to every verb you filled in. Note it is `bash`, not `node` — the
installed `.aidlc/bin/harness` is a shell shim.

### 5. Commit the installation

```bash
git add .aidlc .claude && git commit -m "Install company AIDLC harness"
```

Commit `.aidlc/` and whichever provider projections the pod uses. `.aidlc/state/` is already
gitignored.

### 6. Install the plugin — once per machine, not once per project

The plugin supplies the skills, the subagents and the hook bindings named in `[limits]`. `init` does **not**
copy them into your project; it only records that your project wants them.

```bash
claude plugin marketplace add cwijayasundara/harness_lite_for_claude_v1.0
claude plugin install lean-harness-cs-v1@lean-harness-cs-v1
```

Every teammate runs these two commands once. After that, any project whose committed
`.claude/settings.json` enables the plugin gets it automatically — nothing to configure per
project, and everyone is on the same harness.

Two things worth knowing, both measured rather than assumed:

- `enabledPlugins` in a project's settings **enables** an installed plugin; it does not install
  one. That is why the two commands above cannot be skipped.
- Installing at user scope enables the plugin everywhere on that machine, not only in projects
  that declare it. Use `claude plugin install --scope project` if you would rather it stayed put.

To try the harness without installing anything, point Claude at a checkout for one session:

```bash
claude --plugin-dir ~/lean-harness-cs-v1
```

---

## Your first run

Loading the plugin does nothing visible on its own — there is no welcome banner and no slash
command to fire. **The interface is a normal sentence.** Type something like:

```text
Add pagination to the orders endpoint using the Lean AIDLC workflow.
```

Or, from a PRD:

```text
Take docs/search-prd.md through the Lean AIDLC workflow as faster-search.
```

Claude will investigate, ask you a few focused questions, and write
`.aidlc/artifacts/<slug>/intent.md`. Then it stops and waits for you.

---

## The loop you'll repeat

Claude works one stage at a time and resumes from what's committed, so you never have to
remember where you were.

| Stage | Claude does | You do |
|---|---|---|
| intent | Captures the problem and outcome | Read it and accept it for delivery |
| spec | Numbered testable behaviours, out-of-scope | **Gate 1** — approve and commit |
| plan | Exact files, order, risk, proof per behaviour | **Gate 2** — approve and commit |
| implement | Red-green-refactor until stop checks pass | — |
| review | The evaluator agent reviews the diff against the spec | **Gate 3** — review and merge the PR |

Approve a gate with one command, after the artifact is committed:

```bash
.aidlc/bin/harness approve <slug> spec --by "your name"
```

Commit the approval, then tell Claude:

```text
Approved. Continue the workflow.
```

The three gates are spec approval, plan approval, and PR merge. Everything else runs without
waiting. Editing an approved spec or plan afterwards reports `stale-approval` and stops it
governing anything, so a gate cannot quietly still read as passed while the text under it moved.

---

## What runs automatically

Once installed, hooks fire on their own:

- **After every edit** — fmt, lint, typecheck on changed files
- **Before Claude says "done"** — the full stop stage, including tests
- **Before writes** — guards on protected artifacts and test integrity
- **In CI** — the commit stage, adding secrets scanning, scope-drift, and budget limits

Claude repairs failures itself and pastes the evidence. It should never ask you to run a check.

Claude also picks skills on its own from ordinary requests — "fix this bug" pulls in `diagnose`,
"refactor this" pulls in `change-safely`, unfamiliar code pulls in the `explorer` subagent. You
don't invoke them by name.

---

## Commands you might actually type

Everything below is optional; Claude runs these itself during normal work.

```bash
.aidlc/bin/harness doctor     # is my harness.toml wired up?
.aidlc/bin/harness status     # where is each change in the chain?
.aidlc/bin/harness check --stage stop    # run the checks yourself
```

---

## Troubleshooting

**"I started Claude with `--plugin-dir` and nothing happened."**
That's expected — the plugin has no banner. If you also skipped `harness init`, your project has
no `.aidlc/harness.toml` and every check will fail. Do steps 2–5 above first.

**`.aidlc/bin/harness` throws `SyntaxError: Invalid or unexpected token`.**
In an installed project that file is a bash shim, not JavaScript. Use
`.aidlc/bin/harness ...`.

**`harness: not installed on this machine`.**
The shim could not find the harness. Run the two commands in step 6, or set `HARNESS_HOME` to a
checkout — which is what CI does, using the commit named in `harness-install.json`.

**`harness: ... ENOCONFIG` or "no harness.toml".**
You're not in a project that ran `init`, or you're above its root. `cd` to the project root.

**Every check says `SKIP`.**
`.aidlc/harness.toml` still has empty capability verbs. Go back to step 4.

**Claude ignores the workflow.**
Confirm the plugin loaded with `/plugin` inside Claude Code, and that `.claude/CLAUDE.md` exists
in your project.

---

## How it works

The design follows the [guides and sensors model of harness
engineering](https://martinfowler.com/articles/harness-engineering.html):

- **Guides** act before Claude works — `CLAUDE.md`, a handful of focused skills, artifact templates, the
  code graph, and the explorer agent.
- **Sensors** observe the result — tests, lint, types, secret and plan scope-drift checks, the hook
  bindings, and the evaluator and verifier agents.
- **The ledger** records every sensor invocation, so controls that are noisy or never useful get
  deleted instead of accumulating.

The budget is fixed in `[limits]` of `.aidlc/harness.toml` and nowhere else. Adding one means deleting one; the commit stage enforces it.

Your project inherits that budget **spent, not empty**. The skills the harness ships are counted
alongside any you add, against one ceiling — so your first skill goes red until something is
deleted. Re-run `harness init --into .` after upgrading the
harness, or the recorded half of that count goes stale.

A control enters only with a failing eval or a defect recorded while building a real application
through the harness. Law 11 in the constitution says why. That applies to a skill as much as to a
check: A capable agent being able to follow a generic recipe is not that evidence. Skills reach a
project through the single kernel plugin and nothing else — there is no pack, bundle, overlay or
per-domain marketplace to install more, because that is how a budget stops being one.

Plan, Design, Build, and Test run locally. Deploy and Maintain are yours: the harness ships one
worked example, `examples/maintain/band-to-intent.mjs`, which turns a control-band breach into an
intent, and no deployment code at all.

---

## Further reading

- [Operating the harness](docs/OPERATING.md) — review, adapter seams, deletion audits
- [Build plan](docs/BUILD-PLAN.md) — design decisions and evidence
- [Constitution](docs/CONSTITUTION.md) — the rules the harness enforces on itself

## Developing the harness itself

| Directory | Purpose |
|---|---|
| `.aidlc/bin`, `lib`, `checks`, `hooks`, `skills`, `roles`, `templates` | Shared harness implementation and scaffold templates |
| `.aidlc/artifacts/` | This repository's own change history and approvals; each consumer project has its own |
| `.aidlc/state/` | Ignored runtime state and caches |
| `test/` | Deterministic tests of the harness |
| `evals/` | Development evaluation runners, scenarios and fixtures |
| `evals/evidence/` | Curated development reports and historical evidence |
| `.aidlc/evals/` | Ignored raw evaluation output; never run automatically by normal edit/stop hooks |
| `examples/` | Small consumer projects and a maintenance recipe; not scaffold contents |

During application development, hooks run the application's configured fast/stop checks.
Paid harness evaluations run only through explicit evaluation commands or the configured
credentialed development CI jobs. `harness evals gate` reads saved results; it makes no model call.

```bash
node --test test/*.test.mjs
node evals/run.mjs --dry
```

Worked examples: [`examples/scratch-py`](examples/scratch-py),
[`examples/scratch-ts`](examples/scratch-ts).

### Execution in a worktree

Run `harness status --change <slug>` to select the existing open change this worktree will
execute. This selects its scope; it does not accept its intent or approve its spec or plan.
Both gates must be approved, unchanged and committed. The guard, local scope check, session
context and campaign checks use that same selection. Unrelated backlog drafts and approvals
cannot block or switch it. `harness new` only captures backlog work.

The binding is `aidlc-change.json` in the worktree's own Git directory, including linked
worktrees. It survives session restarts and commits on the same branch. A branch switch needs
explicit reselection; a detached selection is valid only at its exact HEAD. Returning to the
original branch restores its binding only while the selected change and approvals remain valid.
Missing, malformed, deleted-target and closed-target selections grant no scope. Status and
refusals explain the remedy; investigation and artifact drafting remain possible.

Compatibility: selection is now required, including in a repository with one open change.
There is no latest-approval fallback. Select each successive change explicitly, and use
`harness status --clear-change` to clear execution. `status --json` includes `selection` and
`current` alongside the backlog; backlog approval issues can still make status exit nonzero.
Historical artifacts retain their original approvals and meanings. The local scope check
examines staged, unstaged and untracked changes. Use candidate mode for committed PR changes.

### Checking a PR candidate

In a clean tracked checkout of the candidate, run:

```bash
node .aidlc/bin/harness check --stage fast --base <base-sha> --candidate <head-sha> --change <slug> --json
```

The two revisions define an endpoint diff, including all net changes across the commits.
Scope validation always runs in candidate mode, even if the chosen stage omits it. Renames
check both old and new paths; deletions also need ownership. Both selected approvals must
be current and committed. Untracked files cannot satisfy candidate proof promises.
`--change` selects for this invocation only; without it the worktree selection applies.
The report, `.aidlc/state/last-check.json`, and ledger include resolved `base`, `candidate`
and `change` under `revision`. Built-in tamper and secret checks use the same boundary when
included in the stage. Configured external tools receive the candidate file list through
`{files}` if configured; their other behavior remains the project's responsibility.

For GitHub PRs, include exactly one line in the PR description:

```text
Harness-Change: pr-candidate-scope
```

Replace the slug with the PR's approved change. The `candidate-scope` job checks out the PR
head SHA, computes its merge base with the target SHA, and passes the event file using
`--pr-event "$GITHUB_EVENT_PATH"`. Missing or ambiguous references fail. It uploads revision
inputs, the command log, report and ledger even on check failure. Consumer repositories can
copy this job from `.github/workflows/harness.yml`, using their installed harness shim and
runtime setup. Fetch both revisions with full history, keep the checkout at the PR head,
and pass event values through environment variables. Branch protection must separately
require the job; this repository change does not configure hosting settings.

Candidate scope measures the final diff, not edits reverted before the candidate. It does
not authenticate approvals, verify that proof tests executed, or establish merge/deployment
state. Ordinary local checks remain necessary before committing.

### Requirement and execution trace (item 3)

New `harness approve` decisions bind semantic frontmatter and the committed intent,
not just the artifact body. Set these scalar fields in the intent before approval:

```yaml
source: docs/requirements.md
source_revision: <commit containing that document>
```

Use a repository-relative regular file and a Git revision, or an HTTPS ticket URL and
an explicit external revision label. Repository references resolve to a pinned commit
and content digest. External revisions are **externally asserted**, not fetched or
verified. Capture a conversational requirement in a versioned document when it needs
an exact source revision. Nested YAML, duplicate keys and quoted scalars are unsupported.

Add a spec table linking source criteria to every numbered behaviour:

```markdown
## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| AC-1 | B1, B2 |
| local:preserve-spaces | B3 |
```

Use `local:` when assigning a criterion label absent from the source. The harness
checks the mapping's structure; the reviewer checks that it faithfully interprets the
source. New spec approvals capture the exact intent snapshot and its Git revision.
Plans bind the complete approved spec inputs. Requirement or relationship edits need
impact review and spec/plan reapproval through the existing gates. A harmless rebase
preserves content bindings. Changing only intent `status` to `closed` retains historical
approval, while closure still removes execution authority.

Existing approvals remain **legacy/unbound** and retain their historical semantics.
No history is rewritten and no past approval is invented. Upgrading requires explicit
reapproval with the new inputs. A previously recorded versioned binding cannot be
stripped to recover legacy authority. Legacy checks need full Git history; shallow
checkouts must fetch it. Intent/source snapshots must remain available as Git objects.

Candidate `harness check --base <base> --candidate <head> --change <slug> --json`
reports now include `trace`: source and intent revisions, local approval labels/digests,
source criterion → `change#B<n>` → proof row → current-run test observation. The existing
CI upload of `last-check.json` preserves this trace, including on scope failure. The
scope-only CI job reports proof as **not executed**; select a test stage to execute it.
No trace status alone authorizes a merge.

For exact test observations, configure the existing pytest JSON format and reporter:

```toml
[capabilities]
test = "python -m pytest --json-report --json-report-file={report}"
[formats]
test = "pytest"
```

The product environment installs pytest and pytest-json-report; the harness adds no
package dependency. A proof row such as `| B1 | \`tests/test_app.py::test_titlecase\` |`
can match an exact observed node ID, including class/parameter suffixes. Skipped,
failed, missing, ambiguous, malformed and unsupported observations never become passed
proof. File-only/prose rows and other result formats remain unverified. Fast checks do
not imply test execution. Local or changed-during-check workspaces cannot claim clean
candidate proof. The report trusts the configured test tool's output and does not
establish whether its assertions adequately prove the requirement. Overall check
success, binding validity and individual execution statuses must all be reviewed.

Collect GitHub review evidence through a separate read-only mode:

```sh
harness review --repo owner/repository --pr 123 --candidate HEAD --out pr-review.json
```

This uses an authenticated `gh api` connection to github.com, reads all review pages
twice to detect changes during collection, and records the PR head, identities, review
states and visible branch review policy. A positive result requires the exact head,
current approving reviewers with push access, the visible required count and the host's
approving review decision. Stale/dismissed approvals, changes requested, incomplete API
responses and unavailable policy cannot produce verified approval. Exit 1 means approval
was not established; the JSON explains why. Rulesets-only policy visibility, required
code-owner identity and last-pusher independence are not yet supported; those policies
are reported conservatively as unavailable. Verification is limited to the visible
branch review count and current reviewers with push access. The host's full merge controls
remain authoritative. Merge identity is recorded only when supplied by the host; no
release or deployment is inferred.

The saved JSON is point-in-time evidence, not a signed attestation. Local `--by` labels,
injected test transport data and model review never authenticate host approval. This
command neither posts reviews nor merges PRs and does not grant local write scope.

The harness derives no merge eligibility of its own. It reports what the host reported —
the host's own review decision, the visible required count, and current reviewers with
push access — and refuses a verdict whenever one of those is invisible. No verb signs,
attests, certifies, merges or pushes. This surface is frozen: a new assessment state, a
new host verdict field, a new identity root or a signing verb fails
`test/host-evidence.test.mjs`, which is where to argue for one.
The API fields follow GitHub's [pull request schema](https://docs.github.com/en/graphql/reference/pulls)
and [branch protection schema](https://docs.github.com/en/graphql/reference/branches).

### Decomposition and local coordination

`harness status` is a read-only local projection of parent coverage, `depends_on`,
interface snapshots, Files overlaps and optional tracker fields. It is not a delivery
platform or an assignment authority: findings never select a change, transfer write
scope, or certify remote assignment. Remote PR and assignment visibility is unavailable.

When a change is selected, `harness status` and `status --json` without a slug show that
change's slice, still computed against the full local backlog. Pass `status <slug>` to
inspect another change without stealing selection. With no selection, the full local view
remains.

Change assignments in the existing tracker and record the tracker URL. Optional intent
fields `tracker`, `assignee`, `iteration` and `assignment_observed_at` are unverified
local projections. `parent` is contribution; `depends_on` is a delivery prerequisite;
unrelated changes need no `extends` or `supersedes`. Malformed dependency declarations
are refused at plan approval.

### Product and design context at a revision

Inspect source at a revision with `git show <rev>:<path>` and `git grep`. Use
`harness graph query product --revision <commit>` only when delivery records already
exist. Pending approval is not delivered integration. `pack --revision` remains
callable; it is not a delivery platform or assignment authority.

A `delivery.json` beside archived candidate-check and host-review reports may record
exact base/candidate/merge commits. Do not add keys. The query performs no network
calls. Local JSON is unsigned evidence. For a reversal, `supersedes` becomes historical
only after recorded integration; for a refactor, preserve behaviour tests and use
`extends`.

### Reproducible runtime and evidence

`init` records a version-1 runtime identity in `harness-install.json`. Commit that file and
its generated shim. The manifest hashes sorted relative paths, executable modes and SHA-256
file digests, then hashes their JSON array. Coverage is `.aidlc/{bin,lib,checks,sensors,hooks,
adapters,skills,roles,templates,policies,instructions.md}` and `.claude-plugin/`. Mutable state,
change artifacts and product code are excluded. Symlinks are refused. Installation from dirty
covered content or without Git remains unverified; use a clean exact checkout to create a pin.
Consumer initialization does not rewrite the shared runtime's model guides.

The shim verifies before executing runtime code. Explicit `HARNESS_HOME` mismatch fails without
cache fallback. Cache discovery accepts matching covered content only. A cache without Git
reports `pinned-content`, not independently verified Git provenance. A checkout must match both
commit and bytes/modes. Version directory names alone establish nothing. Legacy records require
a deliberate `node <clean-runtime>/.aidlc/bin/harness init --into <project>` migration and commit;
review generated changes. No automatic repinning occurs. This repository reports `development`
for its own uncommitted runtime edits, retaining all existing scope and approval controls.

`harness doctor --json` reports expected/observed runtime identity and actual project policy
identity. Policy hashes configuration, canonical instructions, review policy, root CLAUDE.md
and AGENTS.md, Claude instructions/settings/local settings and .mcp.json, including absent-file
markers. Compare digests across machines; a changed policy is different even on the same Git
revision. Committed/dirty/unavailable states remain visible. This observes files, not prompts
already loaded into a session. Local pins and digests are unsigned comparison anchors, not
publisher authentication or a security sandbox.

Checks accept `--actor <label>`. Otherwise `GITHUB_ACTOR`, when set, is an environment assertion;
missing identity stays unknown. Neither authenticates a reviewer. Reports and ledger rows carry
a unique `provenance.invocation`, actor provenance, runtime/policy identity, selected change,
HEAD/dirty state and optional GitHub run/job references. Candidate mode retains exact base and
candidate commits and executed-proof trace. Runtime mismatch or policy/runtime mutation during
checks makes evidence unsuccessful. No credentials or full environment are captured.

Export an exact recorded invocation with:

```sh
.aidlc/bin/harness ledger export --invocation <uuid> > check-export.json
```

The export preserves original observations. It attaches the full last-check report only if
that report belongs to the requested invocation; otherwise `report_state` is `unavailable`.
Archive each report/export promptly. Legacy rows remain usable for audit without retroactive
attribution. Corrupt or inconsistent evidence fails export. Exports remain unsigned; host review
and merge authority still use the protected review path described above.

For consumer CI, check out the product candidate with full history, read `commit` and repository
from its reviewed installation record, fetch that exact runtime revision into a separate clean
checkout, and set `HARNESS_HOME` to it. Treat repository location as reviewed CI configuration;
do not interpolate arbitrary record text into a shell command. Run `doctor --json` and archive
its identity, then the candidate check. For example, after CI resolves BASE_SHA, CANDIDATE_SHA
and CHANGE from its trusted event inputs:

```bash
set -euo pipefail
mkdir -p .aidlc/state
.aidlc/bin/harness doctor --json > .aidlc/state/doctor.json
set +e
.aidlc/bin/harness check --stage commit --base "$BASE_SHA" --candidate "$CANDIDATE_SHA" --change "$CHANGE" --json > .aidlc/state/check.json
check_status=$?
set -e
if [ -f .aidlc/state/last-check.json ]; then
  invocation=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(".aidlc/state/last-check.json")).provenance.invocation)')
  .aidlc/bin/harness ledger export --invocation "$invocation" > .aidlc/state/check-export.json
fi
exit "$check_status"
```

Start with fresh state so a setup failure cannot archive a previous invocation as this run.
Use the host's `always()` artifact step for doctor/check logs, last-check and export, including
failures. The repository workflow demonstrates this for its PR candidate check. Hosted execution
and branch policy configuration are separate from local validation.
