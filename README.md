# Claude Harness Lean

A lean AIDLC harness for Claude Code. You describe what you want in plain English; Claude walks
it through `intent → spec → plan → code → review`, stopping at three human approval gates, with
deterministic checks (tests, lint, secrets, contract scope-drift) enforced by hooks.

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

The harness reads git history for contract scope and status. Without a git repo, most commands
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
  artifacts/            ← intent / spec / plan / review live here
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

The plugin supplies the 12 skills, the 3 subagents and the 5 hook bindings. `init` does **not**
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
`.aidlc/artifacts/intent/<slug>.md`. Then it stops and waits for you.

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
| review | Independent review against contract and evidence | **Gate 3** — review and merge the PR |

For the current artifact chain, set an intent to `accepted`; set a spec or plan to `approved`.
Commit the decision, then tell Claude:

```text
Approved. Continue the workflow.
```

Intent acceptance is the intake decision. The three delivery gates are spec approval, plan
approval, and PR merge. Everything else runs without waiting.

The production-ready, opt-in delivery-contract path is documented in
[`docs/CONTRACTS.md`](docs/CONTRACTS.md). It remains non-default until comparative evals authorize
Phase 2 adoption.

---

## What runs automatically

Once installed, hooks fire on their own:

- **After every edit** — fmt, lint, typecheck on changed files
- **Before Claude says "done"** — the full stop stage, including tests
- **Before writes** — guards on protected artifacts and test integrity
- **In CI** — the commit stage, adding secrets scanning, scope-drift, and budget limits

Claude repairs failures itself and pastes the evidence. It should never ask you to run a check.

Claude also picks skills on its own from ordinary requests — "fix this bug" pulls in `diagnose`,
"refactor this" pulls in `pure-refactor`, unfamiliar code pulls in the `explorer` subagent. You
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

- **Guides** act before Claude works — `CLAUDE.md`, 12 focused skills, artifact templates, the
  code graph, and the explorer agent.
- **Sensors** observe the result — tests, lint, types, secret and contract scope-drift checks, 5 hook
  bindings, and the reviewer and verifier agents.
- **The ledger** records every sensor invocation, so controls that are noisy or never useful get
  deleted instead of accumulating.

The budget is deliberately fixed at 12 skills, 3 agents, and 5 hooks. Adding one means deleting
one; CI enforces it.

Your project inherits that budget **spent, not empty**. The twelve skills the harness ships are
the twelve, counted alongside any you add, against one ceiling — so your first skill is the
thirteenth and it goes red until something is deleted. Re-run `harness init --into .` after
upgrading the harness, or the recorded half of that count goes stale.

Plan, Design, Build, and Test run entirely locally. Deploy and Maintain expose adapter contracts
but ship empty — you supply your own deployment, rollback, and metric sources.

---

## Further reading

- [Operating the harness](docs/OPERATING.md) — review, deployment, monitoring, deletion audits
- [Build plan](docs/BUILD-PLAN.md) — design decisions and evidence
- [Constitution](docs/CONSTITUTION.md) — the rules the harness enforces on itself

## Developing the harness itself

```bash
node --test test/*.test.mjs
node evals/run.mjs --dry
```

Release sensor ownership is checked separately from the fast edit loop:

```sh
node .aidlc/bin/harness gauntlet doctor
node .aidlc/bin/harness gauntlet run --changed
```

Profiles and project wiring are documented in [docs/SENSOR-GAUNTLET.md](docs/SENSOR-GAUNTLET.md).

Immutable staging deployment, verification, promotion and rollback are described in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

Worked examples: [`examples/scratch-py`](examples/scratch-py),
[`examples/scratch-ts`](examples/scratch-ts).
