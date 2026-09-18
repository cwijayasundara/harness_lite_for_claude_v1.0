# Lean harness: gap analysis and completion plan

Date: 2026-09-12. Branch `autonomous-delivery-loop`, HEAD `b2152c9`. Surveyed read-only against
the fourteen requirements the owner set out, the AI-native SDLC playbook, Fowler's harness
engineering and sensors articles, SPDD, Devin Fusion, the Claude cost guidance, and the
reference harnesses (code-modernization, defending-code, mattpocock skills, swarm-forge,
superpowers, claude_code_for_ci_cd, autoresearch, `claude plugin eval`).

## 1. Verdict

The harness is a well-built governance kernel with no delivery engine attached to it.

What is genuinely strong: a 5.5k-line zero-dependency kernel; a per-change artifact chain with
digest-bound approvals; structural generator/evaluator separation (Sonnet writes, Opus reviews
read-only in a fresh context from an exported snapshot); a ledger that can prove which controls
earn their place; a token ratchet that has already caught two real regressions; 458 deterministic
tests green at HEAD; and a five-sprint evolving-software campaign that did pass live on 6 September
for USD 2.92.

What is missing is the part the owner actually asked for. After a human approves the plan, a human
still types every command. The evaluator review cannot finish (180 s timeout, no flag). Deploy is a
regex. Maintain is a 64-line example whose output cannot pass the gate it was written to start.
The eval suite is switched off: its gate is wired to nothing, its baseline is not green, live product
trials refuse to run, and the paired comparisons are hard-disabled. On the only completed
comparison, native Claude Code delivered the same 35 accepted changes for 23% less money.

Most importantly, the gate model contradicts the brief. Plan and Design approvals are hard
dependencies enforced in three places, cryptographically bound to `intent.md`, and the write guard
refuses every product write until both are committed. The owner asked for the opposite: human
gates that are not hard dependencies, not wired to intent.md, and a fully autonomous
build/test/deploy with the PR as the human checkpoint.

Nothing here needs a rewrite. It needs the engine, a policy layer over the gates, product-facing
sensors, and the evals turned back on. Roughly eight to ten working weeks in six phases.

## 2. Scorecard against the brief

| # | Requirement | Status | One-line evidence |
|---|---|---|---|
| 1 | AI-native SDLC end to end | Partial | Plan/Design/Build/Test exist; Deploy is `productionDenied` regex (`guard.mjs:134`); Maintain is `examples/maintain/band-to-intent.mjs`, and its intent lacks `source` so gate 1 refuses it |
| 2 | Soft human gates on Plan/Design, not wired to intent.md; stories via Jira/Linear; autonomous build/test/deploy; PR gated | Contradicts | `require_contract` defaults true (`config.mjs:50`); write guard denies without approved plan (`guard.mjs:98`); spec approval requires intent with `source`/`source_revision` and a Requirements table (`artifacts.mjs:126`); no tracker client; no driver after gate 2 |
| 3 | Feedforward guides (skills, agents, hooks) | Partial | The shipped skills and roles encode TDD, systematic debugging, verification, test-maintenance ethics. No brainstorm/design alignment, domain modelling, per-project how-to-test. One skill slot spare against the registry ceiling |
| 4 | Sensors so generated code is good | Partial | secrets (6 regexes), scope-drift, budget, tamper, baseline, arch (harness-internal layering only), test_quality (counts `test(`). No coverage, mutation, SAST, dependency rules; project verbs fmt/lint/typecheck/coverage empty |
| 5 | Rely on the agent's codegen and self-correction | Partial | PostToolUse exit-2 self-correction loop is right. Guard false-blocks trapped an agent for 44k output tokens; identity pin makes every write on a dirty tree report a scary non-error |
| 6 | Claude Code in CI/CD | Partial | Harness's own CI only. No consumer workflow with headless review, no PR creation, evals not in CI despite Law 9 saying so |
| 7 | SPDD self-evolving prompts | Mostly done | `supersedes:`/`extends:`, prompts inside the runtime identity, guidance A/B (`agent-mechanisms --guidance-base`), SessionStart line pruning. No REASONS dimensions, no code-to-prompt sync, no prompt regression suite |
| 8 | Evals: LLM judge and metrics | Partial | 22 golden tasks, 15 deterministic assertion kinds, no LLM judge. `expected.json` is 13 pass / 7 fail / 2 flaky. `harness evals gate` runs nowhere. Live product trials throw (`invoker.mjs:63`); comparisons `available = false` (`run.mjs:385`) |
| 9 | Better than vibe coding, as good as a strong engineer | Not shown | Native USD 0.182 vs harness 0.235 per accepted change, identical acceptance. Positive signal: three Opus reviews found real defects after every deterministic gate passed |
| 10 | Token efficiency and Claude cost guidance | Partial | Ratchet, 1,200-token pack, findings cap 20, fail-fast. But SessionStart injects volatile text (ledger counts, map age) that changes the cached prefix each session; Stop hook runs the whole suite; the graph measured not load-bearing (USD 0.252 with vs 0.236 without) |
| 11 | GAN generator/evaluator with the sidekick split | Partial | Sonnet 5 generator, Opus 5 evaluator, ids must differ, evaluator read-only in fresh context. But review times out, repair loop is prose, spec/plan skills carry no model (judgment work runs on whatever the session has), no escalation route |
| 12 | Track runs and self-improve | Partial | Ledger is a real subtractive loop (7 verdicts, false-block flags, deterrents). No additive loop, no playbook metrics, no experiment log |
| 13 | Replicate `claude plugin eval init` | Missing | No `evals/<case>/prompt.md` + `graders/*.md`; no WITH/WITHOUT ablation |
| 14 | Sensors and review at the end, not parallel review swarms | Aligned | One evaluator, one pass, at the end. Cost: the suite runs at Stop, at commit, and around review |
| 15 | Automated test of the harness on a new repo across 2+ sprints | Partial | `campaign-ledger` (5 sprints, sprint 3 reverses sprint 1's rule, sprint 4 refactors) exists and passed live on 6 Sep. It cannot run today. A deterministic two-engineer campaign runs in 23 s on every `node --test` |

## 3. Gap analysis in detail

### 3.1 The gate model is inverted relative to the brief

Today a product write is refused unless the selected change has a committed approved spec and a
committed approved plan, the intent carries `source` and `source_revision` pointing at a committed
blob or an https ticket, and the spec's Requirements table covers every behaviour. Three mechanisms
enforce this independently: `approve()` refuses, the PreToolUse guard denies, and `scope-drift`
fails the commit stage. The same rule is applied to shell redirects.

This is correct for a regulated single-track workflow and wrong for the workflow described in the
brief. The playbook says gates belong at the edges, not inside the build loop, and this repository's
own Law 8 says the same. The campaign history proves the cost: findings F28 through F35 are all gate
ceremony (a skill stopping for approval, a drafted spec blocking product writes, an amended spec
keeping its old link, an agent approving its own gate). 315 of 561 tracked files are artifacts. The
research proposal's own line: "exact authority can trap the agent".

Required shape: approvals are recorded decisions that the PR displays, not preconditions for
writing code. Story decomposition happens in the tracker; the harness reads a story and writes back
a commit SHA. Merge stays human.

### 3.2 There is no delivery engine

The chain is `intent → spec → plan → implement → review → merge`, but nothing drives it. The
`autonomous-delivery-loop` intent (drafted 11 September, at gate 1) describes the gap exactly: a
person relays `implement`, `check`, `review`, `implement` by hand. Three consequences it records are
all verifiable: `phases.json` and `comparison.json` are written incrementally and read back by
nothing, so an interrupted run restarts; the commit stage used to run the suite twice (now fixed by
`a-check-runs-the-suite-once`); and `band-to-intent.mjs` produces an intent gate 1 refuses.

Also: `harness review` hardcodes 180 s (`review.mjs:110`) with no CLI flag. Measured on 10
September: a 17 KB diff timed out, a 165 KB diff timed out, and two paid runs produced nothing and
recorded no spend. The evaluator, the one part of the design that demonstrably adds quality, cannot
complete inside the shipped CLI.

### 3.3 The evaluator split exists but the sidekick pattern is half applied

Devin Fusion's rule is that the frontier model owns the plan, the interpretation of ambiguity and
the final review, while the cheaper model executes. Here `implement` is pinned to Sonnet 5 and
`evaluator.md` to Opus 5, which is right. But `intent`, `spec` and `plan` carry no `model:`, so the
judgment-heavy work runs on whatever the session happens to be. There is no repair loop in code
(the "at most twice" rule is prose in the evaluator role), no escalation when the generator fails
twice, and the "generation" comparison arm that would have measured the cheap-plus-evaluated route
never completed (13 accepted changes, billing unknown).

### 3.4 Sensors are harness-facing, not product-facing

Of the seven checks, only `secrets`, `tamper` and `scope-drift` say anything about a consumer's
product code. `arch` encodes the harness's own four-layer import order. `test_quality` counts the
string `test(`. The capability verbs a product needs (`fmt`, `lint`, `typecheck`, `coverage`,
`deps`) are empty in this repository and in the template, so a fresh install verifies nothing but
secrets and whatever test command the owner types in. Fowler's sensor list (type checker, lint with
complexity rules, SAST, dependency-layer rules, coverage, incremental mutation testing) is absent
except as a slot. Sensor messages do not carry self-correction guidance, although `normalize.mjs`
already has a `fix` field for it.

The ledger's sensor-effectiveness tracking is ahead of the article's recommendation and should be
kept exactly as it is.

### 3.5 Deploy and Maintain are declared, not built

Deploy: a bash regex denies `deploy|terraform apply|kubectl apply|helm upgrade` combined with
`prod` unless `HARNESS_RELEASE_APPROVAL` is set. That is an environment variable, not a release
record, and no hook logs the decision with reason and approval route as the playbook asks. No PR
is ever opened by the harness. No consumer CI template runs a review; `docs/OPERATING.md` only
shows how to fetch the harness at a pinned commit.

Maintain: the 3-sigma band script is the right shape (deterministic detection first, model only
after breach) and is the right size. Its output is unusable because gate 1 requires provenance
fields it does not write. Incident-to-eval (`harness new eval`) exists.

### 3.6 The eval system is complete and switched off

`evals/run.mjs` validates tasks, refuses ungraded runs, distinguishes inconclusive from failed,
runs paired comparisons with alternating arm order, and never treats missing billing as free. The
gate is raise-only and refuses non-comparable baselines. This is better than most published
harness eval code. And:

- `harness evals gate` is in no stage and no CI job. `docs/CONSTITUTION.md` Law 9 says "enforced: CI".
- `evals/expected.json` records 13 pass, 7 fail, 2 flaky at USD 8.59. The baseline is red.
- CI's `evals` job runs `agent-mechanisms.mjs --live`, not the golden suite.
- Live product trials throw because the container was removed and nothing replaced it. The five-sprint campaign, the strongest evidence the harness has, is unreachable.
- All four comparison pairs are hard-disabled by `const available = false`.
- There is no LLM-as-judge grader anywhere, so spec-compliance of campaign output is graded by hand-written product assertions only.
- Nothing uses the `claude plugin eval` format, which would give the WITH/WITHOUT-plugin delta (the "better than vibe coding" number) for free.

### 3.7 Cost posture

Good: ratchet on `session_context_tokens` and `claude_md_tokens`, findings cap, fail-fast, pack
budget, subscription auth enforced. Problems, in the order the Claude guidance ranks levers:

1. Caching. The SessionStart payload embeds a 30-day ledger row count, noisy-control names and map
   age. Every session therefore starts with a different prefix. Move volatile lines to the end of the
   payload or drop them.
2. Input trimming. `harness review` unpacks the whole candidate tree and gives the model Read/Grep/Glob
   over it; a scoped export (plan `## Files` plus their callers) would be an order of magnitude smaller.
3. Loop pruning. The Stop hook runs the full suite on every stop (180 s budget) and the commit stage
   runs it again. One full run per delivery iteration is enough.
4. Model selection. No effort level is set anywhere; `implement` on Sonnet at default effort for
   mechanical slices, and no `low`-then-retry strategy.

The graph and pack are a sunk investment with disputed evidence (33% cheaper than `rg` for a
definition-only question; 5% more expensive per accepted change in the paired campaign). Freeze it,
measure it in phase 5, decide then.

### 3.8 Hygiene that costs real time

- The uncommitted self-exemption diff makes 39 tests fail; the same tree committed is 1 failure (a
  clone-origin artefact). It is a good change and should land.
- `docs/LEAN-HARNESS-IMPLEMENTATION-BACKLOG.md` marks F01, F04 and F18 TODO; all three shipped.
  `docs/DEFECT-REPAIR-PLAN.md` treats D1 to D3 as open; all three shipped. Law 9 claims CI
  enforcement. Golden task count is 22, docs say 20. `docs/PROGRAM.md` is gone but still referenced.
- 26 open intents, 24 of them delivered and never closed; `harness status` and SessionStart list them.
- A second plugin named `harness` (v0.3.1, `harness-local`) is installed at user scope with agents
  named `harness-evaluator-fast`, `harness-generator` and a `harness-tracker-publish` skill. None of
  it is in this repository. Two harnesses with overlapping names in one session is how F28 happened.
- Dead code: `lockTests`/`clearLock` reference a `harness lock` verb that does not exist;
  `[sensors]` profiles and `subagent_context_*` limits are parsed and never read; `verifyReporting`
  is unreachable; `pre-write`/`pre-bash` dispatch cases are unbound.

### 3.9 Is this too complex?

Yes in three places, no elsewhere.

- Approval binding cryptography (source digest, intent digest, spec digest, walking 50 revisions to
  find the approved text) is the right idea at the wrong strength for a small team. Keep the digests
  as a staleness signal shown on the PR; stop using them to refuse writes.
- The runtime identity pin refuses to run any control on a dirty tree. That is correct for a
  consumer and hostile for the developer of the harness; the self-exemption diff already concedes
  this. Consumers keep the pin; this repository runs in `development` identity.
- Recursive self-improvement. The autoresearch loop needs a single scalar objective and a green
  baseline. You have neither yet. Build the metrics and the eval gate first, then run one bounded
  nightly experiment over steering text. Do not automate control addition; Law 11 is right.

## 4. Plan

### Principles

- Land in the order that makes the next phase measurable: truth first, then policy, then engine,
  then sensors, then edges, then evals, then improvement.
- Every phase ends with a number the next phase compares against.
- No new control without a failing eval or a product defect (Law 11 stays). Control flow is a
  CLI verb (Law 2 stays). The skills budget stays at seven; adding one means merging one.
- The harness must show it beats native Claude Code on the campaign at parity cost before phase 6
  spends anything on self-improvement.

### Phase 0: truth and stability (week 1)

1. Commit the self-exemption diff on this branch. Verify: clean suite 457 of 458, the last being the
   clone-origin README check.
2. `harness review --timeout <ms>`, default proportionate to diff size, and a timeout path that
   records `total_cost_usd` and partial findings. Verify on the 17 KB diff that timed out.
3. Wire `harness evals gate` into CI as a nightly job on `CLAUDE_CODE_OAUTH_TOKEN` with
   `--max-cost`, and mark Law 9 truthfully until it is green.
4. Docs: write the completion records the backlog demands, close the defect plan, fix the counts,
   remove the `PROGRAM.md` references. Close the 24 delivered intents.
5. Uninstall or rename the `harness-local` plugin on developer machines; record the decision.
6. Delete the dead code listed in 3.8.

Exit: suite green on a clean clone and on a dirty tree in this repository; review completes on a
real diff and records its spend; nightly eval job runs and reports (red is acceptable here).

### Phase 1: gates become policy (weeks 2 to 3)

1. `[gates]` in `harness.toml`: `spec`, `plan`, `merge` each one of `human`, `advisory`, `auto`.
   `merge` is always `human`. Defaults: `spec = advisory`, `plan = advisory`.
   - `human`: today's behaviour.
   - `advisory`: writes proceed; the write guard warns instead of denying; `scope-drift` and the
     approval state become PR annotations and a `harness status` row. A stale or missing approval
     is visible, never blocking.
   - `auto`: the driver records `approved_by: policy` with the policy digest, shown on the PR.
2. Decouple spec approval from `intent.md`. `source` becomes optional; when present it is a
   tracker URL or a repository path and the digest is a staleness signal only. The Requirements
   table stays optional and is checked when present.
3. Story intake: `harness new --from <tracker-url | prd.md>` creates one change per acceptance
   criterion group, using the existing `parent` and `depends_on` fields. Tracker is read at start
   and written back once with the PR URL and commit SHA at the end (playbook single-source rule),
   through whichever MCP server the project configures. No tracker client is written into the kernel.
4. Keep the two-engineer campaign test green throughout; add a case for `advisory` mode.

Exit: a change goes from intent to a merge-ready PR with zero `approve` commands under `advisory`
and with two under `human`; false-block rate on the golden tasks drops to zero for write refusals.

### Phase 2: the delivery engine (weeks 3 to 5)

Implement the drafted `autonomous-delivery-loop` change as `harness deliver <slug>`:

1. Phases: implement (generator, forked context) → `check --stage stop` → refactor under green →
   `harness review` (evaluator, fresh context, scoped export) → repair (at most two, then stop with
   the findings) → `check --stage commit` → open the PR with the `Harness-Change:` line through `gh`
   → stop. The driver never merges and never approves.
2. Bounded by wall-clock, USD and repair count, from `harness.toml`. Stops and names the bound.
3. Resumable from `phases.json`; refuses to resume if the plan digest changed.
4. Model per stage: `intent`, `spec`, `plan` and review on the evaluator model; `implement` on the
   generator; repair on the generator, escalating to the evaluator model on the second attempt.
   `effort: low` for implement slices the plan marks mechanical.
5. Move volatile SessionStart lines to the end of the payload so the cached prefix is stable.
6. The Stop hook runs `fast` plus the changed-file tests only; the full suite runs once per
   delivery iteration inside the driver.

Exit: one `campaign-ledger` sprint delivered end to end with one human action (PR review); cost per
accepted change and cache-hit rate recorded in the ledger.

### Phase 3: product-facing sensors and guides (weeks 5 to 6)

1. `harness init` detects the toolchain and fills the capability verbs: TypeScript (`tsc --noEmit`,
   `eslint` with complexity and max-lines rules, `vitest --coverage` or `node --test`), Python
   (`ruff`, `mypy`, `pytest --cov`). Empty stays `skipped`, as Law 6 requires.
2. Coverage joins the baseline ratchet (per-file, raise-only). `test_quality` is replaced by
   `behaviours_have_tests` plus coverage.
3. Opt-in verbs with documented commands: mutation (`stryker` / `mutmut`), SAST (`semgrep`),
   dependency layering (`dependency-cruiser` / `import-linter`).
4. Every finding carries a `fix:` line written for the model, and the tamper rule accepts a
   suppression with a `why:` (already the case) and reports it in the PR.
5. Skills: merge `map` into `.claude/harness/instructions.md` and add `design` (brainstorm the outcome,
   resolve design branches, produce the Entities/Approach/Structure/Safeguards sections of the
   spec, in the REASONS shape). The `CLAUDE.md` template gains a Commands-with-healthy-output block
   and a Verification block.
6. Disable user-level skill inheritance inside eval and delivery runs
   (`--setting-sources project,local` is already used by the invoker; apply it to the driver).

Exit: `examples/scratch-ts` and `examples/scratch-py` run every verb in CI; a planted surviving
mutation and a planted layer violation are each caught.

### Phase 4: deploy and maintain edges (weeks 6 to 7)

1. Consumer CI template: on PR, `candidate-scope` check plus a headless evaluator review
   (`claude -p --output-format json --json-schema review-findings.schema.json`, read-only tools)
   posted as one PR comment with `detected_pattern` per finding and prior findings deduped; merge
   guarded by branch protection with code-owner review, so the agent that wrote the code cannot
   approve it.
2. Deploy gate: `release-authorization` reads a release record (`.claude/harness/state/release.json` with
   who, when, candidate SHA) instead of an env var; every allow or deny is a ledger row with reason
   and approval route. Rollback is one documented command in `CLAUDE.md`.
3. `band-to-intent.mjs` writes whatever provenance phase 1 still requires, and `harness new eval`
   is called from the same script so every incident becomes a golden task.

Exit: a breach in a test produces an intent that passes into the driver; a `deploy prod` command
is denied without a release record and allowed with one, both recorded.

### Phase 5: evals that run, and the vibe-coding comparison (weeks 7 to 9)

1. Restore a boundary for live product trials. Recommended: the ephemeral CI runner is the
   boundary (nightly workflow, OAuth token, `--max-cost-usd`, artifacts uploaded); locally, opt-in
   Claude Code sandbox settings on a temp worktree with Bash denied outside it. Remove
   `available = false`.
2. Move the 22 golden tasks to the `claude plugin eval` layout (`evals/<case>/prompt.md`,
   `graders/*.md`, free graders only) and run with `--threshold`, pinned `--model` and
   `--judge-model`, `--max-cost-usd`. The WITH/WITHOUT delta is the harness's contribution number.
   Keep `evals/run.mjs` for multi-sprint campaigns; it does what plugin evals cannot.
3. Add one `llm` grader (evaluator model, 2-of-3) for spec compliance of campaign output.
4. Make the baseline green: fix or retire the 7 failing tasks, then `harness evals gate --update`.
   From then on the nightly gate blocks merges to main on regression.
5. Re-run the native comparison on `campaign-ledger` after phases 1 to 4.

Exit criteria, all three required: acceptance on the five-sprint campaign at least equal to native;
cost per accepted change no more than native plus 10%; at least one evaluator-caught defect per
campaign that native shipped.

### Phase 6: bounded improvement loop (from week 10, ongoing)

1. Metrics computed from git and the ledger, printed by `harness ledger`: first-pass CI success
   rate, rework cycles per change, time from plan approval to PR, escaped versus caught defects,
   repeat incident class, eval mean delta.
2. Guidance experiments in the autoresearch shape: one steering-text change per run, objective is
   eval mean delta at fixed cost, `git commit` then measure, keep or `git reset`, one line appended
   to `evals/experiments.tsv`, nightly, budget-capped, never pauses to ask.
3. The ledger audit stays the only way a control leaves; Law 11 stays the only way one enters.

Exit: none by design; the trend lines are the exit.

## 5. Decisions the owner must make

1. Default gate mode. Recommended `advisory` for spec and plan, `human` for merge. The brief says
   this; the code says the opposite today.
2. Authentication. Subscription-only blocks the Batch API and explicit cache control. Recommended:
   keep subscription-only, accept the loss, revisit if nightly eval cost exceeds USD 20.
3. The graph. Recommended: freeze now, measure in phase 5, delete if it is not load-bearing.
4. Live boundary. Recommended: CI runner nightly plus local opt-in sandbox; no Docker in tests.
5. Skill budget. Recommended: hold at seven by merging `map` into instructions.

## 6. Evidence index

- Code survey and docs survey were produced in this session from the working tree at `b2152c9`.
- Test runs: dirty tree 418 pass / 39 fail; clean clone 456 pass / 1 fail (README origin check).
- Comparison: `evals/evidence/comparison-summary.json`, batch starting 2026-09-07T16:53:21Z.
- Live campaign: `evals/evidence/product-summary.json`, 2026-09-06, USD 2.92, 15 model calls.
- Review timeouts: memory note 2026-09-10, 17 KB and 165 KB diffs.
- Reference requirements: 30-item cross-cutting checklist compiled from the fourteen sources.
