# Build plan — claude_harness_lean_v1

> A lean, language-agnostic SDLC harness for Claude Code, built from the v6 post-mortem
> (`docs/analysis.html`) and aligned to Anthropic's AI-native SDLC playbook.
>
> **Scope of v1:** automated governance for Plan, Design, Build, and Test, plus provider-neutral,
> tested adapter seams for Deploy and Maintain. Deploy has review evidence, production approval,
> command adapters and durable receipts; Maintain deterministically turns a numeric control-band
> breach into incident → intent. Provider credentials, metric sources, and production commands
> remain project-owned.
>
> **Decisions taken:** Node.js with zero dependencies · shipped as a Claude Code plugin ·
> every generated artefact lives under `.claude/` · proven first against a scaffolded scratch
> repository, then dogfooded.

---

## 0. What this replaces

| v6 | lean_v1 |
|---|---|
| 1,595 files, ~195k LOC | target < 40 files, < 4,000 LOC |
| 56 skills | 11 |
| 10 agents (6 never spawned) | 3, each with a contract |
| 15 hooks, 121 hook-lib files | 5 bindings, 1 dispatcher |
| 4 control registries, 180 controls | 1 registry, 6 controls |
| 8 evals | 20, with variance on the top 3 |
| Outcome ledger with 0 rows | Ledger written from the first invocation |
| 9 packs, 4 profiles, partition checker | 8 capability verbs in a TOML table |

The single change that makes the rest possible: **the subtractive force works from day one.**
v6 could only grow because its removal mechanism required ≥20 recorded outcomes and never
received one. Here the ledger is control #1 and has no off switch.

---

## 1. Playbook alignment

The playbook's artefact chain is adopted verbatim; the ceremony around it is not. Every stage
commits a file the next stage reads, and git is the audit trail.

| Playbook stage | This harness | Human gate |
|---|---|---|
| **1. Plan** — capture as `intent.md` | `intent` skill → `.claude/artifacts/intent/<slug>.md` | — |
| **2. Design** — `spec.md` guided by skills | `spec` skill → `.claude/artifacts/spec/<slug>.md`; org policy via `org-policy` plugin | **Gate 1** — spec approved |
| **3. Build** — plan mode, CLAUDE.md, subagents | `plan` + `implement` skills, 5 hooks, 3 agents | **Gate 2** — plan approved |
| **4. Test** — evals woven through | `harness check` stages + `evals/tasks.json` in CI; `harness status` reports pass rate | — |
| **5. Deploy** — PR review, hooks as gates | `review` skill → `.claude/artifacts/review/<slug>.md`; CI + merge protection are the gate; `handoff` opens the next draft PR | **Gate 3** — review approved / PR merged |
| **6. Maintain** — bands → `intent.md` | `harness monitor detect` (scheduled) writes incident + intent; collector is project-owned | service owner triage |

This table distinguishes a **core implementation** from an **adapter contract**. Stages 1–4 run
inside the repository today. Stages 5–6 have schemas, validation, and gates, but only become
operational when a target repository supplies its SCM, deployment, rollback, and monitoring
adapters. Do not describe a template as automation or an uncommitted approval as a passed gate.

**Where we follow the playbook exactly**

- `intent.md → spec.md → plan.md → diff` as version-controlled handoffs.
- `CLAUDE.md` under one page, containing commands, conventions and *things this project gets
  wrong* — a line added the **second** time a mistake happens, never the first.
- Skills as advisory institutional knowledge; hooks as deterministic guards that can block.
- Verification before "done", against a quantifiable target: no completion claim without the
  pasted output of `harness check --stage stop`.
- Continuous evals re-run on any change to skills, hooks or config.
- Separation of duties: the `verifier` agent has `Bash` so it can run the checks and no `Write`
  so it cannot make them pass. Enforced by contract, not by prose.

**SPDD and prompt provenance.** The artifact chain is the prompt chain: each slug is the stable
change identity, every artifact links backward, and git preserves the prompts, corrections, and
approvals that produced the code. Do not create a second prompt registry. Put reusable procedure
in a skill; put change-specific problem, context, constraints, acceptance criteria, and decisions
in intent/spec/plan/review. A ticket may remain the system of record only when the intent links it.

**Automate and agent teams.** Non-interactive Claude is appropriate for eval runs, read-only CI
triage, and incident diagnosis after deterministic detection; any write must arrive as a PR through
the same review gate. The lean harness does not add an autonomous build loop or worktree swarm.
Its three agents divide exploration, review, and verification where separation of duties has a
measured benefit. Parallel implementation is a project-level choice for independent plan slices,
not another permanent harness control; the plan's file ownership must be disjoint first.

**Where we deliberately diverge, and why**

| Playbook | Here | Reason |
|---|---|---|
| Approval-gate hooks during Build | Gates only at spec, plan, merge | An approval pause inside the build loop destroys the parallelism agents are for. The playbook says this itself; v6 ignored it and built five autonomy modes. |
| Managed settings, OSCAL, certification | Not in v1 | These are enterprise rollout controls. They gate nothing until the harness is proven on one repo. |
| `bands.yaml` anomaly detection → `intent.md` | Deferred | This is the stage v6 built and never ran. It is the highest-risk piece to build speculatively. |
| Skills up to 500 lines / 5k words | 130-line hard stop, ~80-line target | Empirically better triggering. v6's skills averaged 268 lines and its two conductors were effectively 1,000 and 1,850. |
| Repo-root `docs/` for artefacts | Everything under `.claude/` | One directory to gitignore, one to copy between repos, one place an agent looks. |

---

## 2. Repository layout

```
claude_harness_lean_v1/
├─ README.md
└─ .claude/                          ← the plugin root; everything lives here
   ├─ .claude-plugin/plugin.json
   ├─ bin/harness                    single entrypoint: init doctor check new ledger hook
   ├─ lib/                           toml · config · paths · normalize · ledger · runner
   ├─ checks/                        secrets · plan-drift · budget      (built-in sensors)
   ├─ hooks/                         dispatch.mjs + hooks.json          (5 bindings)
   ├─ skills/                        11 skills, median 33 lines
   ├─ agents/                        3 agents + 3 .contract.json
   ├─ templates/                     harness.toml · CLAUDE.md · intent/spec/plan
   ├─ evals/                         tasks.json (20) + fixtures
   ├─ test/                          node:test, zero deps, runs on a cold clone
   ├─ docs/                          CONSTITUTION.md · BUILD-PLAN.md · analysis.html
   └─ examples/scratch-py/           the proving ground
```

In a **target** repository the harness creates only this:

```
<repo>/.claude/
   ├─ harness.toml                   the only hand-edited registry
   ├─ CLAUDE.md                      ≤120 lines
   ├─ artifacts/{intent,spec,plan,adr}/
   └─ state/                         gitignored: ledger.jsonl · last-check.json · graph.json
```

---

## 3. Phases

Each phase is independently useful and abandonable without waste. No phase starts before the
previous one's exit criterion is demonstrably met.

### Phase 0 — Walking skeleton · **COMPLETE**

`harness.toml` with eight capability verbs · `bin/harness` with the normalised finding schema ·
three built-in checks · the five hook bindings · the ledger, writing from the first invocation.

- **Exit criterion:** one real change in one real repository, with rows in `ledger.jsonl`.
- **Evidence:** `examples/scratch-py` — a shortlink service taken through
  intent → spec → plan → red → green → `--stage commit` green, 33 ledger rows across 6 controls,
  `plan-drift` correctly firing on an unplanned file (it caught a stray file the test tooling
  had created, on its first real run). Running the same skeleton on a machine without `ruff` or
  `pytest` installed then exposed a genuine design bug within minutes: a missing binary was
  being recorded as `fail` rather than `errored`, which would have made a dead sensor look like
  one earning its place. Exit code 127 is now classified as `errored`, and there is a test for
  it — the first entry in the loop the whole harness is built around.

### Phase 1 — The artifact chain and the guards · **COMPLETE**

Four chain skills · two write guards with the shell-bypass closed · three agent contracts ·
`CLAUDE.md` template under 120 lines · the `plan-drift` check.

- **Exit criterion:** a PRD reaches a merged change through the chain, and the diff's file list
  matches the plan.
- **Evidence:** `.claude/artifacts/` in the scratch repo; `harness check --stage commit` passes
  on the aligned diff and fails on an off-plan edit.

### Phase 2 — Evals, then freeze · **COMPLETE**

Eight fixtures over a shared `_base` (one `harness.toml`, not eight — the same Law 3 that
governs the harness governs its tests): `clean-app`, `buggy-calc`, `broken-suite`,
`legacy-untested`, `approved-intent`, `approved-spec`, `planned-change`, `at-skill-limit`.

`evals/run.mjs` with an **injected invoker**, so staging, grading and reporting are all exercised
by `test/evals.test.mjs` with a fake — no model, no key, no spend. Per-task USD ceiling and
timeout, `--dry` static validation, `--id` filter, and a clean exit-0 when `ANTHROPIC_API_KEY`
is absent so it never blocks a contributor running `node --test`.

Variance is first-class: three tasks run three times, and **2-of-3 reports as `flaky`, never
rounded up to green** — a suite that rounds is a suite that has stopped detecting drift.

- **Exit criterion:** the suite is green, and the budget test goes red when a thirteenth skill is
  deliberately added.
- **Evidence:** 29 unit tests green on a cold clone; `run.mjs --dry` → *20 tasks valid, $15.75
  ceiling*; the `at-skill-limit` fixture passes `--stage commit` at 12 skills and fails at 13 with
  *"delete one before adding another"*. A fixture-sanity test asserts `clean-app` is genuinely
  green and `buggy-calc`/`broken-suite` genuinely red — a fixture that is not actually broken
  silently passes every task written against it.
- **What the fake invoker caught immediately:** every case-insensitive assertion in `tasks.json`
  used the inline flag `(?i)`, which JavaScript regex does not support — each would have thrown at
  construction and been recorded as an ordinary failure. `toRegExp` now translates the inline flag,
  and `validate()` rejects a non-compiling pattern statically rather than at $0.75 a run. This is
  the second time in two phases that running the thing found a defect that reading it did not.

**From here the counts are frozen.** Skill #13 or hook #6 needs a deletion first.

### Phase 3 — Graph, wiki, context packs · **COMPLETE**

`test/graph.test.mjs` was written **before** the producer, against a purpose-built `graph-app`
fixture with a known call structure and a deliberate import cycle. That ordering is the whole
point: v6's graph was fresh, cheap, correctly synced and answering about the wrong tree, because
nothing ever asked it a question with a known answer.

**Departure from this plan, stated rather than quietly absorbed.** The plan said tree-sitter.
Tree-sitter means native bindings or vendored wasm, and a harness that must run on a cold clone
with no install step can have neither. The producer is therefore zero-dependency and
line-oriented: **module import edges are high fidelity; symbol call edges are heuristic**,
filtered against the known symbol table so an unknown name is treated as a builtin rather than
an edge. That is honest for a navigation cache and Law 7 already forbids treating it as an
authority. Fixing the plan first, then the code, is the rule the harness applies to everyone else.

- **Exit criterion:** the pack benchmark shows a measured token reduction against whole-file reads.
- **Evidence:** `evals/bench/pack-bench.mjs` over ten golden queries — **100% recall, 3,492 vs
  35,835 tokens, 90.3% reduction** — wired into the unit suite so a regression fails the build.
  The spread is worth reading: on the toy fixture the saving is 20–38%, on the harness's own
  files 84–97%. A context pack earns nothing on small files and a great deal on real ones.
- Five questions answered and asserted: callers · calls · hubs · cycles · changed-since.
- **The v6 regression is a test:** `the harness is visible to its own graph` asserts
  `lib/runner.mjs` and `hooks/dispatch.mjs` are indexed and that calls inside `.claude/` resolve.
- Hub ranking excludes test modules as importers (v6's committed wiki ranked `test/helpers/` as
  its top two hubs); `callers` deliberately **includes** test callers, because an agent about to
  change a symbol needs its tests most of all.
- Sync: append-on-edit at `PostToolUse`, coalesce at `Stop`, incremental below 200 dirty files,
  TTL lock, fail open, `STALE since` stamped into the wiki *and* surfaced at `SessionStart`.
  On a cold clone it **builds** rather than returning quietly — v6's second graph bug.
- Wiki: deterministic, LLM-free, gitignored, one page per cluster. No committed HTML browser.
- `harness pack "<symbol>"` — definition, then callees, then callers, greedy to budget, with
  everything dropped named rather than silently truncated.
- The `map` skill lands as skill #12.

**Three bugs the tests found that reading would not have.** Stripping template literals and
f-strings removed every call interpolated inside one — invisible in review, and in JS/TS that is
a large share of all calls. An empty answer to `cycles` was rendering as a cache miss telling the
reader to `grep -rn ""` — a complete answer misreported as ignorance. And the refresh lock
released by truncation without the take path treating an empty file as free, so the second
refresh in any session was permanently blocked.

**The budget is now full: skills 12/12, agents 3/3, hook bindings 5/5.** Every further addition
requires a deletion, which is the state Law 5 exists to force.

### Phase 4 — Second language, then the cost ratchet · **COMPLETE**

**Law 6 held.** `examples/scratch-ts` — TypeScript, eslint, tsc, `node:test` — runs the same
harness as the Python example with **zero code differences between them**. The whole of the
difference is eight strings in `.claude/harness.toml`. The `eslint` and `tsc` normalizers
written in Phase 0 needed no changes; findings from ruff, eslint and tsc arrive in the identical
`{file, line, rule, message, fix}` shape, which is the point of that decision.

One normalizer was added, and it is deliberately not a one-off: **`tap`**, covering
`node --test --test-reporter=tap` and anything else speaking TAP 13 — a lowest common
denominator across many runners rather than a per-project adapter.

**A real defect, found only by running it.** With `stop = ["fast", "test"]`, a single type error
failed lint, typecheck *and* the build step of the test command — one defect, three reports,
twelve wasted seconds and a buried actionable line. `[check] fail_fast = true` now stops at the
first failing verb, and `--all` gives the full picture on demand. Crucially the skipped verbs are
**recorded in the ledger as `skipped` with the reason**, never silently absent: a verb that did
not run must not quietly flatter its own fire rate in the very ledger that decides whether it
survives.

**The cost ratchet, split honestly.** `harness baseline capture|check` measures the token
surface *the harness itself controls* — `CLAUDE.md`, the SessionStart context block, a green
stage's rendered output, the wiki index, and pack size at p50 on the repo's own most-connected
symbols. All deterministic, so it ratchets today with no key and no spend, and it is the half
regressions actually come from because it is the half we keep editing. The model-side
per-change figure (output tokens, USD) is a separate slot filled by the eval suite's
`under_baseline` assertion when it runs with a key — **never fabricated here**, and `capture`
preserves any previously measured model figure rather than overwriting it with null.

- **Exit criterion:** a Python repo and a TypeScript repo run the same harness with no code differences.
- **Evidence:** both examples green through `--stage stop`; deliberately breaking the TS project
  three ways produces one report, not three; bloating `CLAUDE.md` by 40 lines fails
  `baseline check` with *"claude_md_tokens 265 -> 686, +159%"* and exit 1.
- CI now runs three jobs: the unit suite, the pack benchmark, and the cost ratchet — the last
  two needing no API key.

**A second defect, found by shipping it.** The first run of `baseline check` on a machine without
`ruff` or `pytest` reported *"check_stop_tokens 18 -> 107, +494%"* and failed. It was measuring
the laptop, not the change: a missing tool renders "tool not installed" text where three PASS
lines used to be. `capture` now records which controls errored, and `compare` marks
environment-sensitive metrics `n/a — toolchain differs` rather than grading them. This matters
more than it looks: a control that fires for reasons unrelated to the change is one people learn
to ignore, and a control people ignore has already died. `capture` also renders the wiki before
measuring it, because an unbuilt wiki read as 0 tokens — absence dressed up as an improvement.

**Known limitation, stated rather than discovered later.** The line-oriented producer does not
see symbols defined inside callbacks, so `test('...', () => {...})` bodies contribute no call
edges. In the TS example that means the test file's use of `slugify` is invisible to `callers`.
This is the fidelity trade named in Phase 3 and it is exactly why Law 7 forbids concluding a
negative from the graph.

### Phase 5 — Dogfood, then earn controls back · **RUNNING**

This phase cannot be completed in a session; it is four weeks of real work and then a decision.
What is done is everything that makes those four weeks produce a decision rather than a shrug.

**Installed and self-governing.** The harness now runs on its own repository via
`harness init --into .` — `harness.toml`, a real 50-line `CLAUDE.md`, and `settings.json`
**generated** from `hooks/hooks.json` so the two cannot drift. `--stage commit` is green on the
harness itself: secrets, the full 49-test suite, plan-drift, budget.

**No self-exemption.** v6's strongest control — agents may not modify the gates that verify
their own work — was bypassed by `isHarnessRepo()` in the only repository it ever ran in. There
is no equivalent here. The first thing self-governance did was flag the harness's own eval
corpus for a committed API key; the fix was the documented escape hatch on the offending line,
not a carve-out for the scanner.

**First real eval run — 20 tasks against a live model, $13 total.**

14 of 20 passed on the first attempt. **Every one of the six failures was a defect in the
harness or in the eval, not a guide that failed.** That is what the suite is for, and it is the
only reason these were found before your team hit them:

| Failure | Root cause | Fix |
|---|---|---|
| 3 artifact-chain tasks | Claude Code guards `.claude/**` as sensitive, so the artifact chain we deliberately put there **cannot be written non-interactively** | `harness init` now writes a scoped `permissions.allow` for `.claude/artifacts/**`; evals use a disposable copy |
| `red-first` | `CLAUDE.md` documents `bash .claude/bin/harness`, which does not exist when the harness is installed as a plugin — the model ran `find / -iname harness` looking for it | `harness init` writes a shim at that exact path, so the documented command is always true |
| `scope-refusal` | assertion chased *phrasings* of a refusal; three correct refusals failed in a row | assert the **subject** the response must engage with, never the wording |
| `plan-drift-honesty` | the task's premise was false — nothing forced an off-plan change | fixture now requires one |
| 2 more | prompts under-specified, so the skills correctly asked a question a one-shot run has nobody to answer | prompts supply what the interview asks for |

Two of those are product bugs every user would hit on day one, and neither was visible by
reading the code.

**Also measured, not assumed:** one `claude -p` invocation costs ~$0.20 before doing any work
(cache creation on the system prompt), so per-task ceilings below $0.60 abort rather than bound.
And `--dangerously-skip-permissions` is inert without its enabling flag — the tell is a task
that fails with an empty transcript.

**Shipped this phase**

- **The dress rehearsal.** `test/rehearsal.test.mjs` runs the whole suite against a stub that
  does nothing — no key, no spend — and asserts every task *runs* and **no task passes**.
  **Four of the original twenty passed a do-nothing model**: they asserted absence of harm
  without presence of work, and would have reported green forever while measuring nothing.
- **The invoker, finally exercised.** Seven tests drive the ~25 lines that shell out to
  `claude -p`: argv, usage extraction, non-JSON fallback, non-zero exit, timeout, and a missing
  CLI — now reported as `notInstalled`, aborting the suite instead of failing twenty tasks.
- Failed runs now persist the transcript and the list of files the model touched. Without them
  a failure can only be triaged by paying for the task again.
- The auth gate no longer keys on `ANTHROPIC_API_KEY` alone — `claude -p` authenticates from a
  Claude Code login too, so the old gate refused to run on the machines most able to.

- **The dress rehearsal.** `test/rehearsal.test.mjs` runs the entire eval suite against a stub
  `claude` that reads the prompt and does nothing — no key, no spend — and asserts two things
  the suite cannot check about itself: that every task *runs* (no crash, no unknown assertion,
  no missing fixture), and that **no task passes**. A task a do-nothing model satisfies is a
  task with no assertions in it, and it reports green forever while measuring nothing.
  **Four of the original twenty were exactly that** — `plan-alignment`, `pure-refactor`,
  `no-secret-commit` and `cost-ratchet` all asserted absence of harm without presence of work.
  Each now carries an assertion only a model that did the job can satisfy, and the rule is
  written at the top of `tasks.json` where the next author will see it.
- **The invoker, finally exercised.** The ~25 lines that shell out to `claude -p` had never run.
  Seven tests now drive them against a stub on PATH: argv construction, JSON usage extraction,
  non-JSON fallback, non-zero exit, timeout, and a missing CLI — which is now reported as
  `notInstalled` and aborts the suite, rather than twenty tasks failing with empty transcripts.
  Same lesson as exit 127 in the check runner: never let an absent tool masquerade as a verdict.

- `harness ledger audit` — the kill criteria as thresholds in one place
  (`fires on ≥5%`, `errors on <10%`, `after 50 invocations`), printing one decision per control
  and a delete list. `insufficient-data` is a first-class verdict: a verdict without evidence is
  not a verdict.
- `harness init` now wires hooks, generating `settings.json` from the one registry (Law 3).
- `docs/OPERATING.md` — the daily/weekly/monthly loop, the incident→eval rule, and the ordering
  that matters most: a recurring finding becomes **a `CLAUDE.md` line first, a check second, and
  a skill only if both fail and something else is deleted.**
- A parked-candidates list, so the instinct to build gets written down instead of acted on.

**The rule for the next four weeks: add no controls.** Not a skill, not a hook, not a check.
That instinct is precisely what produced a 180-control harness with an empty outcome ledger.

- **Exit criterion:** none, by design. This is the steady state and the point of the whole thing.
- **First real checkpoint:** the month-end audit. Until then every control reads
  `insufficient-data`, which is the honest answer and not a failure.

**The caveat, stated now rather than discovered at the audit.** A ledger built only on this
repository describes harness development, not product work. `arch`, `coverage` and `typecheck`
will read `skipped` here forever because this repo has no toolchain to run them. Installing into
one real product repo before month-end costs about a minute and is the difference between an
audit that speaks for your team's work and one that speaks for an unusual codebase of 49 tests
and no dependencies.

**Release-hardening checkpoint.** Artifact slugs reject paths and non-canonical names; approval
only counts once committed; artifact ordering and all SLA clocks are checked from git history;
configured secret scanners override the built-in fallback; `doctor` reports that fallback
truthfully; external installs carry a private runtime rather than a checkout-dependent shim; and
CLI tests prove both failure exits and a successful incident → intent handoff. CI exercises this
inside disposable real git repositories rather than passing `status` vacuously on an empty root.

---

## 4. Explicitly not in v1

Each consumed real effort in v6 and returned nothing measurable. Not forbidden forever —
forbidden until the ledger asks for them.

multi-lane routing · conductor skills · auto-continue hooks · concurrency gates · autonomy tiers ·
certification profiles · pack/profile installer · partition checker · control-budget meta-ratchet ·
dedup audit tooling · OTel + Prometheus + Grafana · DSL packs · board control plane · worktree
fan-out · LLM-generated wiki · committed HTML viewers · producer adapter ladder ·
prose-consistency tests · compress-cache-retrieve · six-tool navigation index

---

## 5. Instrumentation

Four numbers, all from the ledger and the eval suite. `harness ledger` prints them; there is no
dashboard stack.

| Metric | Definition | Reads as |
|---|---|---|
| First-pass merge rate | changes merged from the first implementation attempt | are the guides working |
| Tokens per merged change | output tokens and USD vs `baseline.json` | the token goal, as a ratchet |
| Sensor precision | per control: fired ÷ invocations, plus true-positive rate from review findings | which control to delete next |
| Eval pass rate | suite result on every config change, with variance | did a harness edit help or only differ |

**Kill criteria, written down before they are needed**

- A **control** dies at fire rate <5% over 50 sessions with zero true positives, or when deleting
  it does not move the eval suite.
- A **skill** dies when it has not been invoked in 30 days, or when it could be three lines of
  `CLAUDE.md`.
- A **subsystem** dies when its own benchmark shows no measured benefit — which is why every
  subsystem ships with its benchmark in the same PR.
- **The harness itself** is in trouble when the budget test starts requiring exemptions, when two
  files can disagree about the same fact, or when you route around a lane you built. All three
  happened in v6, and each was visible in the repository months before it was acted on.

---

## 6. Risks

| Risk | Signal | Mitigation |
|---|---|---|
| The chain becomes ceremony people route around | `.claude/artifacts/` empty while commits land | Gate 1 and 2 are the only pauses; `low` risk tier skips straight to implement |
| The graph repeats the v6 blindness | wiki hubs are test helpers | Phase 3's five-question test is written *before* the producer |
| Controls creep back in | budget test needs an exemption | Law 5 is a red test, not a review comment |
| Evals rot into transcript-regex theatre | assertions drift toward `transcript_matches` | Deterministic assertions are the default; regex needs a reason in the task |
| Node becomes a dependency in a Python shop | complaints at install | Node ships with Claude Code; if that changes, `bin/harness` is ~400 LOC to port |
| It stays a side project | no dogfooding | Phase 5 has no exit criterion on purpose — the harness is only real when it is in the way of real work |
