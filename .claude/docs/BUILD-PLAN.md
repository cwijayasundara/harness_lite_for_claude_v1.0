# Build plan — claude_harness_lean_v1

> A lean, language-agnostic SDLC harness for Claude Code, built from the v6 post-mortem
> (`docs/analysis.html`) and aligned to Anthropic's AI-native SDLC playbook.
>
> **Scope of v1:** playbook stages 1–4 — Plan · Design · Build · Test.
> Deploy and Maintain are deliberately out until the ledger has data.
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
| **2. Design** — `spec.md` guided by skills | `spec` skill → `.claude/artifacts/spec/<slug>.md` | **Gate 1** — spec approved |
| **3. Build** — plan mode, CLAUDE.md, subagents | `plan` + `implement` skills, 5 hooks, 3 agents | **Gate 2** — plan approved |
| **4. Test** — evals woven through | `harness check` stages + `evals/tasks.json` in CI | — |
| **5. Deploy** — PR review, hooks as gates | `review` skill only; approval gates deferred | **Gate 3** — PR merged |
| **6. Maintain** — bands → `intent.md` | deferred to v2 | — |

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
  had created, on its first real run).

### Phase 1 — The artifact chain and the guards · **COMPLETE**

Four chain skills · two write guards with the shell-bypass closed · three agent contracts ·
`CLAUDE.md` template under 120 lines · the `plan-drift` check.

- **Exit criterion:** a PRD reaches a merged change through the chain, and the diff's file list
  matches the plan.
- **Evidence:** `.claude/artifacts/` in the scratch repo; `harness check --stage commit` passes
  on the aligned diff and fails on an off-plan edit.

### Phase 2 — Evals, then freeze · **NEXT — week 1**

- [ ] Build the six fixture repos (`buggy-calc`, `broken-suite`, `clean-app`, `planned-change`,
      `legacy-untested`, `at-skill-limit`).
- [ ] Write `evals/run.mjs` with an **injected invoker**, so the runner is unit-testable with no
      model in the loop; per-task USD ceiling and timeout; exit 0 when `ANTHROPIC_API_KEY` is absent.
- [ ] Variance: run the three highest-signal tasks three times; report 3-of-3 separately from 2-of-3.
- [ ] CI: run the suite on any diff touching `skills/ agents/ hooks/ checks/ lib/ harness.toml`.
- **Exit criterion:** the suite is green, and the budget test goes red when a thirteenth skill is
  deliberately added. From here the counts cannot grow without a deletion.

### Phase 3 — Graph, wiki, context packs · week 2

- [ ] One producer: tree-sitter, multi-language, **indexing dotdirs** — the failure that made v6's
      graph blind to itself is a one-line filter, and the test below is what stops it recurring.
- [ ] `test/graph.test.mjs` asks the five questions against a fixture and asserts the answers:
      *who calls X · what does X call · what are the hubs · what cycles exist · what changed under
      this symbol since ref.*
- [ ] Sync: append-on-edit dirty list (already wired in `post-write`) → coalesce at `Stop` → TTL
      lock → `STALE since` stamp. **Build the graph on a cold clone rather than returning quietly.**
- [ ] Deterministic LLM-free wiki: per-cluster markdown, 30–200 lines a page, gitignored. No
      committed HTML browser.
- [ ] `harness pack "<question>"` → ~1,200 tokens of `file:line` slices, with a recall benchmark
      against naive full-file reads.
- [ ] The `map` skill (skill #12 — this consumes the last budget slot).
- **Exit criterion:** the pack benchmark shows a measured token reduction against the Phase 1
  baseline. If it does not, the graph is a cache miss and it gets cut.

### Phase 4 — Second language, then discipline · week 3

- [ ] Add a TypeScript project by writing eight strings and nothing else. This is the test of Law 6.
- [ ] Add `tsc` and `eslint` normalizers if the existing ones do not suffice.
- [ ] Cost ratchet: capture `baseline.json` — per-stage output tokens and USD for one reference
      change — and fail CI on a regression, exactly as for a failing test.
- **Exit criterion:** a Python repo and a TypeScript repo run the same harness with zero code
  differences between them.

### Phase 5 — Dogfood, then earn controls back · ongoing

- [ ] Run the harness on real work for four weeks without adding a control.
- [ ] Monthly `harness ledger --days 30`: delete anything with a fire rate under 5% over 50
      sessions and zero true positives.
- [ ] Any recurring review finding becomes a `CLAUDE.md` line **first**, a check **second**, and
      a skill only if the first two fail.
- [ ] Every production incident becomes a permanent eval.
- **Exit criterion:** none. This is the steady state, and the point of the whole design.

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
