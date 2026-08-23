# claude_harness_lean_v1

A lean, language-agnostic SDLC harness for Claude Code.

Everything lives under [`.claude/`](.claude). Start with:

- **[.claude/docs/BUILD-PLAN.md](.claude/docs/BUILD-PLAN.md)** — the plan, phase by phase, and how it maps to Anthropic's AI-native SDLC playbook
- **[.claude/docs/CONSTITUTION.md](.claude/docs/CONSTITUTION.md)** — the ten laws, three of them enforced by tests
- **[.claude/docs/analysis.html](.claude/docs/analysis.html)** — the v6 post-mortem this is built from

## Try it

```bash
node .claude/bin/harness init --into /path/to/your/repo   # writes .claude/harness.toml + CLAUDE.md
cd /path/to/your/repo
node <this-repo>/.claude/bin/harness doctor               # which of the 8 verbs resolve
node <this-repo>/.claude/bin/harness check --stage stop
node <this-repo>/.claude/bin/harness ledger
```

A worked example, taken through intent → spec → plan → red → green, lives in
[`.claude/examples/scratch-py`](.claude/examples/scratch-py).

## What it is

Two things, and nothing else: **guides** that steer the agent before it acts, and **sensors**
that observe after — plus the ledger that decides which of them survive.

| | |
|---|---|
| One entrypoint | `.claude/bin/harness` — hooks, the agent and CI all call it |
| One registry | `.claude/harness.toml` — 8 capability verbs; adding a language is 8 lines |
| One finding schema | `{file, line, rule, message, fix}`, whatever the tool or language |
| Three human gates | spec approved · plan approved · PR merged |
| Hard budgets | ≤12 skills · ≤3 agents · ≤5 hooks · ≤600 hook LOC · ≤120 CLAUDE.md lines |

```bash
node --test .claude/test/*.test.mjs    # zero dependencies, runs on a cold clone
```
