# Claude Harness Lean

A lean, language-agnostic AIDLC harness for Claude Code. It turns product intent into a
version-controlled chain of `intent -> spec -> plan -> code -> review`, while skills, subagents,
hooks, and deterministic checks guide and verify ordinary "vibe-coded" requests.

The design follows the [guides and sensors model of harness engineering](https://martinfowler.com/articles/harness-engineering.html):

- **Guides** act before or while Claude works: `CLAUDE.md`, focused skills, artifact templates,
  the code graph/context pack, and the explorer agent.
- **Sensors** observe the result and feed actionable findings back: tests, linting, type checks,
  secret and plan-drift checks, hooks, and the reviewer and verifier agents.
- **The ledger** records every sensor invocation so controls that are noisy, broken, or never
  useful can be fixed or deleted instead of accumulating forever.

Unlike [claude_harness_eng_v6](https://github.com/cwijayasundara/claude_harness_eng_v6), Lean
does not reproduce a large conductor command for every phase or provide an ungated `/auto`
loop. It uses Claude Code's normal skill triggering, three narrowly scoped subagents, five hook
bindings, and one deterministic CLI. The result is the same disciplined lifecycle with less
permanent machinery.

## Requirements

- Git
- Node.js (no npm install is required; the harness has zero runtime dependencies)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview)
- Your project's own formatter, linter, type checker, and test runner

## Install in a project

Clone this repository once:

```bash
git clone https://github.com/cwijayasundara/claude_harness_lean_v1.git
export LEAN_HARNESS_DIR="$PWD/claude_harness_lean_v1"
```

Initialise the target repository:

```bash
cd /path/to/your/project
node "$LEAN_HARNESS_DIR/.claude/bin/harness" init --into .
```

`init` is idempotent. It creates the project-owned `.claude/harness.toml`, `.claude/CLAUDE.md`,
artifact directories, hook settings, and a private runtime copy at `.claude/runtime/`. The
generated `.claude/bin/harness` shim is independent of the original clone, so CI and other
developers do not need the source checkout at the same path.

Next, edit `.claude/harness.toml` once so its eight capability verbs call the tools used by the
project. After that, product work does not require users to invoke the harness executable.

Start Claude Code with the Lean plugin to make its skills and subagents available:

```bash
claude --plugin-dir "$LEAN_HARNESS_DIR/.claude"
```

Organization policy skills (security, brand, UX) are a **second plugin**. They must not be copied
into `.claude/skills` — that directory is the kernel budget (12). From this checkout:

```bash
claude plugin marketplace add "$LEAN_HARNESS_DIR"
claude plugin install lean-harness@lean-harness-local
claude plugin install org-policy@lean-harness-local
```

Replace `plugins/org-policy/skills/secure-api/SKILL.md` with the policy owner's source of truth
before treating it as binding. `harness init` does not copy policy skills into a target repo.

Run the plugin-dir or marketplace commands from the target repository. Commit the generated
`.claude/` installation so CI and other developers receive the same runtime and controls; only
`.claude/state/` is local, generated state and is ignored.

## Use the AIDLC workflow

The user interface is a conversation, not slash commands or shell commands. Give Claude the
outcome or PRD and ask it to run the Lean AIDLC workflow:

```text
Take docs/search-prd.md through the Lean AIDLC workflow as faster-search.
Pause only when you need an answer or a human approval. Continue through implementation,
verification, and review after each approval.
```

For work without a PRD:

```text
Add pagination to the orders endpoint using the Lean AIDLC workflow.
```

The workflow is state-driven. Claude inspects the committed artifacts for the change and enters
the first incomplete stage:

| State | Claude's work | Exit condition |
|---|---|---|
| No intent | Investigate the request, ask focused questions, and capture the problem and outcome | intent is ready |
| Intent ready | Wait for the human to approve and commit it | committed intent approval |
| Intent approved | Specify numbered, testable behaviours and explicit out-of-scope | spec is ready |
| Spec ready | Wait for the human to approve and commit it | committed spec approval |
| Spec approved | Explore the code and plan exact files, proof, risk, and any necessary ADR | plan is ready |
| Plan ready | Wait for the human to approve and commit it | committed plan approval |
| Plan approved | Implement vertical slices using red-green-refactor | stop-stage sensors are green |
| Implementation green | Run independent review against the spec and plan | review artifact is ready |
| Review ready | Wait for human review and PR merge | change is complete |

At each gate, review the artifact in `.claude/artifacts/`, change its status to `approved`, and
commit that approval. On the default branch, `harness-handoff.yml` runs `harness handoff --write`
and opens a PR with the next-stage **draft** — a committed approval is enough to start spec or
plan; filling the draft still needs a session. You can also tell Claude:

```text
Approved. Continue the workflow.
```

Claude resumes from repository state, so the workflow does not depend on remembering the chat
or naming the next phase. The stable change slug links intent, spec, plan, implementation, and
review. The internal harness CLI creates and validates those artifacts, but Claude invokes it;
the user does not.

`harness status` prints the playbook indicators (intent survival, time to committed intent,
spec rework after plan, first-pass review, eval pass rate) from git history. A scheduled
`harness-monitor.yml` job runs `harness monitor detect` with no model: a numeric band breach
writes incident + draft intent and opens a triage PR. Configure `[monitoring].collect` in
`harness.toml` when the project has a real metric source.

## What happens during ordinary “vibe coding”

Requests such as “add this endpoint,” “fix this bug,” or “refactor this module” still enter the
harness. Claude Code chooses focused skills from their descriptions, and those skills invoke
the supporting machinery when relevant:

- `intent`, `spec`, `plan`, and `implement` keep work on the artifact chain.
- `tdd-first`, `diagnose`, `pin-behaviour`, and `pure-refactor` shape the working method.
- The **explorer** subagent maps unfamiliar code without filling the main context; the
  **reviewer** evaluates the diff independently; the read-only **verifier** runs final proof.
- `PreToolUse` guards protected artifacts and test integrity. `PostToolUse` runs fast checks and
  refreshes graph state. `Stop` runs the configured stop-stage checks.
- Findings use one compact `{file, line, rule, message, fix}` schema, regardless of language or
  tool, so Claude can repair them in the same session.

Skills and agents are selected only when the request calls for them; Lean does not spawn all
three agents on every edit. Hooks are deterministic and run automatically after `init` when the
project's `.claude/settings.json` is active.

## Automatic checks

The stages in `.claude/harness.toml` compose eight language-neutral verbs: `fmt`, `lint`,
`typecheck`, `test`, `coverage`, `arch`, `secrets`, and `deps`. Hooks run fast feedback after
edits and the full stop stage before completion. Claude must repair failures and paste the final
evidence rather than asking the user to run a check. CI runs the commit stage, including plan
drift and harness budgets. Missing project tools are reported as unavailable, never silently
counted as passing.

Claude also uses the graph, wiki, and budgeted context packs internally when it needs codebase
context. Operators can use the CLI directly for diagnostics and ledger audits, but it is not
part of the AIDLC user workflow.

The graph is a navigation cache, not an authority. Its module imports are high fidelity, while
symbol-call edges are deliberately heuristic.

## Human gates and deployment boundary

Lean has three human gates: spec approval, plan approval, and approved review/PR merge. Core
Plan, Design, Build, and Test run locally. Deploy and Maintain expose provider-neutral adapter
contracts, but a project must supply its own SCM, deployment, rollback, credentials, and metric
sources. The harness does not claim that an empty template deployed a service.

See [Operating the harness](.claude/docs/OPERATING.md) for review, deployment, monitoring,
weekly operation, and deletion audits. See the [build plan](.claude/docs/BUILD-PLAN.md) for the
v6 comparison and design evidence, and the [constitution](.claude/docs/CONSTITUTION.md) for the
rules enforced by the harness itself.

## Develop and verify the harness

```bash
node --test .claude/test/*.test.mjs
node .claude/evals/run.mjs --dry
```

The unit suite has zero dependencies and runs on a cold clone. Worked Python and TypeScript
examples live in [`.claude/examples/scratch-py`](.claude/examples/scratch-py) and
[`.claude/examples/scratch-ts`](.claude/examples/scratch-ts).
