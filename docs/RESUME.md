# Resume here

**Point-in-time note, written 2026-09-04. Delete it when the work below has landed.** It is not a
source of truth: `harness status` says where every change is, and the artifacts say what each one
promised. This only says what a fresh session cannot reconstruct in one command.

## What the harness is now

Rebuilt over three sprints from a 4,761-line kernel with roughly 2,700 lines no stage reached.

| | Before | Now |
|---|---:|---:|
| Kernel lines | 4,761 | ~3,100 |
| Tracked files | 359 | 235 |
| CLI verbs | 23 | 13 |
| Skills | 10 | 7 |
| Hook bindings | 5 | 4 |
| CI workflows | 9 | 1 |

A change is one directory, `.aidlc/artifacts/<slug>/`, holding `intent.md`, `spec.md`, `plan.md`
and `review.md`. `harness new <slug>` creates it. `harness approve <slug> spec|plan --by <name>`
is the only approval verb; it refuses an uncommitted artifact and refuses a plan before its spec.
An approval is frontmatter plus a digest of the body, so editing an approved artifact reports
`stale-approval` rather than still reading as approved. Ownership lives in `## Files` in the plan
and nowhere else; `scope-drift` and the write guard read it through one function.

`[models]` names three: `generator` Sonnet 5 writes, `evaluator` Opus 5 judges read-only in a
worktree it did not write to, `evals` Haiku 4.5 drives the golden suite. `harness init` renders
the first two into frontmatter and a test fails if they are ever the same id.

Law 11, added this week: a control enters only with a failing eval or a defect recorded while
building a non-harness application. Both previous attempts grew because the only workload they
governed was themselves.

## Do these first

1. **Add the API key.** `gh secret set ANTHROPIC_API_KEY --repo cwijayasundara/harness_lite_for_claude_v1.0`.
   It prompts with hidden input. Until it is set, any push touching a skill, role, hook, sensor,
   template or the registry fails CI — deliberately, because a green tick meaning nobody looked is
   worse than a red one. A local `.env` covers local runs only and the runner reads it now.
2. **Export the harness location for the example app.**
   `export HARNESS_HOME=~/Documents/rnd_2026/claude_scaffold_research/claude_harness_lean_v1`,
   or `dunning`'s shim reports "not installed on this machine".

## Two changes are open

Run `harness status` in each repository; both are waiting on a human, not on work.

**`evolving-scope`** (this repository). Intent and spec written and committed, plan drafted, none
approved. It is the answer to "how do I test this without doing it by hand": multi-sprint
campaigns where the agent gets one sprint's requirement at a time and never sees the next.

Why it matters more than it sounds. All 22 golden tasks are one prompt against a fixture built for
that prompt, so scope is never unknown and artifacts never evolve. Slug directories are islands:
when sprint 2 supersedes a behaviour approved in sprint 1, nothing records it, and the old spec
keeps saying `approved` while describing behaviour the code no longer has. That is the two-way
sync SPDD asks for and the harness cannot currently express. Brownfield has never been tested at
all, and a greenfield project becomes brownfield the moment sprint 1 lands.

One useful discovery: the eval runner already executes multi-step tasks with assertions between
steps, and no task has ever used it. Most of the machinery is built and dormant.

Deliberately undecided, and the campaigns decide rather than reasoning: whether supersession needs
a `supersedes:` link, an amended spec, or an accumulated product spec; and whether brownfield
needs a `harness adopt` verb or is just the first plan owning what it touches. No fix lands in
that change — findings go to `evidence.md` and each becomes its own intent.

**`customers-and-invoices`** (`../dunning`). The example application's first feature. Intent, spec
and plan written and committed, spec not approved. Eight behaviours; two carry the weight — money
never becomes a float on any path, and storage is a file rather than per-instance memory.

`dunning` is local only, has no git remote, and its branch is `master` rather than `main`.

## Sequencing, if you want one

The example app and the campaigns test different things and neither blocks the other. The app
produces real defects under Law 11; the campaigns produce them faster and more cruelly. Doing the
campaigns first means the app is built on a harness that has already been shaken.

## Things a fresh session should not re-litigate

- **The code graph stays.** It was proposed for deletion because nothing used it; the bench says
  90% recall at a 96.5% token reduction, 3,397 tokens against 97,995. Usage was the wrong measure.
  What was actually wrong is that nothing kept it current and nothing pointed at it, and B11 fixed
  both. DeepWiki itself was declined: external, badge-gated refresh, an MCP dependency for what a
  local index already answers.
- **Rendered wiki pages are not coming back.** They existed for eleven days and no change's
  evidence ever cited one.
- **The budget is not a number to raise.** Routing searches to the graph needed a hook binding
  against a full ceiling of five; the two pre-tool bindings merged into one instead, which left
  four and a spare slot.
- **Six false blocks in one session came from one root cause**: a guard confusing naming a thing
  with doing it — a commit trailer, an arrow function, a heredoc quoting a rule. Every guard now
  strips heredoc bodies and quoted spans before matching, and `harness ledger flag <rule>` exists
  so a human can mark a fire wrong and the audit can tell noise from a catch.
