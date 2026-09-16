# Lean harness completion plan

Prepared 12 September 2026 from [the gap analysis](GAP-ANALYSIS-2026-09-12.md). This is the
execution handoff. One item is one change slug under `.aidlc/artifacts/<slug>/`, one PR, one
independently verifiable outcome. Items are ordered so every phase ends with a measurement the next
phase compares against.

This plan supersedes `LEAN-HARNESS-IMPLEMENTATION-BACKLOG.md` (10 September). Backlog items F01,
F04 and F18 shipped; F03, F10, F14 and F15 are absorbed below (marked); the rest are either
redesigns this plan does differently or are dropped with a reason in the appendix.

## Read this before starting

- The brief, not the constitution, is the source of requirements. Where they disagree the brief
  wins and the constitution is amended in the same PR (G07 amends Law 8, G04 amends Law 9).
- Laws that stay untouched: Law 2 (control flow is a CLI verb), Law 5 (`[limits]` are hard),
  Law 6 (capability verbs, an empty verb is `skipped`), Law 11 (a control enters only with a
  failing eval or a product defect).
- Zero dependencies. Ordinary tests invoke zero models. Subscription authentication only.
- One item per PR. If an item stops fitting in one PR, split it and give the second half its own
  slug. Suggested files are starting points, not scope restrictions.
- Every item's acceptance ends with `harness check --stage stop` output pasted into `review.md`.
- Phase exit criteria are measured, not asserted. Record the number in the phase's closing commit.

## Work order

| ID | Phase | Deliverable | Depends on | Absorbs |
|---|---|---|---|---|
| G01 | 0 | Land the self-exemption change | — | — |
| G02 | 0 | Review has a timeout flag and records spend on timeout | G01 | — |
| G03 | 0 | Dead code and doc drift removed; delivered intents closed | G01 | — |
| G04 | 0 | Nightly eval gate in CI, Law 9 stated truthfully | G01, G02 | — |
| G05 | 0 | One harness per machine | — | — |
| G06 | 1 | `[gates]` policy: human, advisory, auto | G01 | — |
| G07 | 1 | Spec approval no longer requires intent provenance | G06 | — |
| G08 | 1 | Story intake from a tracker or PRD | G07 | F07 |
| G09 | 2 | `harness deliver`: implement, check, review, repair, PR | G02, G06 | F10 |
| G10 | 2 | Model and effort per stage | G09 | F03 |
| G11 | 2 | Stable session prefix; one full suite per iteration | G09 | F09 |
| G12 | 3 | Toolchain detection fills the capability verbs | G01 | F12 |
| G13 | 3 | Coverage ratchet replaces `test_quality` | G12 | F12 |
| G14 | 3 | Opt-in mutation, SAST and layering verbs | G12 | F12 |
| G15 | 3 | Findings carry a fix line; suppressions reported on the PR | G12 | — |
| G16 | 3 | `design` skill replaces `map`; CLAUDE.md template gains Commands and Verification | G09 | — |
| G17 | 4 | Consumer CI template with headless review | G09, G15 | F14 |
| G18 | 4 | Release record replaces the environment variable | G17 | F14 |
| G19 | 4 | Maintain edge closes: breach to intent to eval | G07, G18 | F15 |
| G20 | 5 | Live boundary restored: CI runner and local sandbox | G04 | F16 |
| G21 | 5 | Golden tasks in the `claude plugin eval` layout | G20 | F16 |
| G22 | 5 | Spec-compliance LLM grader for campaigns | G21 | — |
| G23 | 5 | Green baseline and a blocking nightly gate | G21, G22 | — |
| G24 | 5 | Native comparison on calculator | G09 to G19, G23 | F05, F17 |
| G25 | 6 | Playbook metrics from git and the ledger | G24 | — |
| G26 | 6 | Nightly guidance experiment loop | G25 | — |

Phase exit criteria are listed at the end of each phase section.

## Phase 0: truth and stability

### G01 — Land the self-exemption change

**Work:** Commit the nine-file diff on `autonomous-delivery-loop` as it stands. It disables the
harness's own hooks in this repository and adds a root `CLAUDE.md` to the consumer scaffold. Do not
widen it.

**Start here:** the working tree. `test/install.test.mjs:205` already asserts the new behaviour.

**Acceptance:** a clean clone at the new HEAD runs `node --test test/*.test.mjs` with one failure,
the README clone-origin check, and that failure passes when the clone's origin is set to the GitHub
URL. The dirty-tree count of 39 failures is gone.

### G02 — Review has a timeout flag and records spend on timeout

**Work:** `harness review --timeout <ms>`; default derived from diff size (a floor of 300 s, plus a
per-KB allowance, capped at 900 s). On timeout, keep whatever the CLI streamed, write the report
with `status: incomplete`, and record `total_cost_usd` when the JSON envelope arrived. Scope the
export: the candidate tree is filtered to the plan's `## Files`, their importers from the graph, and
tests naming them; the full tree remains available behind `--full-tree`.

**Start here:** `.aidlc/lib/review.mjs:103-142`, `.aidlc/bin/harness:475`, `test/review.test.mjs`.

**Acceptance:** unit tests cover the default calculation, the flag, and the incomplete path with a
fake invoker. One live run on the 17 KB diff that timed out on 10 September completes and records
spend under USD 2. The memory note `harness-review-times-out` is retired.

### G03 — Dead code and doc drift removed; delivered intents closed

**Work:** Delete `lockTests`/`clearLock` and the `harness lock` message; delete the unbound
`pre-write`/`pre-bash` dispatch cases; delete `[sensors]` profile parsing and the three
`subagent_context_*`/`review_diff_max_bytes` defaults nothing reads; wire `verifyReporting` or
delete the `retrieval-app` trial. Write completion records for F01, F04, F18 in the old backlog and
mark it superseded by this plan. Close the defect plan. Fix the golden task count in
`CONSTITUTION.md` and `evals/README.md`. Remove `PROGRAM.md` references. Set `status: closed` on the
24 delivered intents. Truncate `.aidlc/state/ledger.jsonl` to the last 30 days and archive the rest
under `.aidlc/evals/archive/`.

**Start here:** `.aidlc/lib/guard.mjs:284`, `.aidlc/hooks/dispatch.mjs:153`,
`.aidlc/lib/config.mjs:27-35`, `evals/run.mjs:255`, `docs/`.

**Acceptance:** `harness status` lists two open changes (`a-pack-answers-the-question-asked`,
`autonomous-delivery-loop`); SessionStart payload shrinks and `baseline capture` records it;
`test/contracts.test.mjs` passes; no test references a deleted symbol.

### G04 — Nightly eval gate in CI, Law 9 stated truthfully

**Work:** A `schedule` job in `.github/workflows/harness.yml` running `node evals/run.mjs --live`
under `CLAUDE_CODE_OAUTH_TOKEN` with `--max-cost-usd 15`, then `harness evals gate`, uploading
`.aidlc/evals/results/`. Until G23 the gate step is `continue-on-error: true` and Law 9 reads
"(enforced: nightly, non-blocking until the baseline is green)".

**Start here:** `.github/workflows/harness.yml:113-140`, `.aidlc/lib/eval-gate.mjs`,
`docs/CONSTITUTION.md:48`.

**Acceptance:** one nightly run appears in Actions with a graded summary line and a recorded cost.

### G05 — One harness per machine

**Work:** Uninstall the `harness@harness-local` v0.3.1 plugin from developer machines, or rename its
agents so no name collides with this repository's `evaluator`, `explorer`, `verifier`. Record the
decision in `docs/OPERATING.md`.

**Acceptance:** `claude plugin list` on the owner's machine shows one harness; the eval invoker's
`--setting-sources project,local` remains in place.

**Phase 0 exit:** suite green on a clean clone and on a dirty tree in this repository; review
completes on a real diff and records its spend; the nightly eval job runs and reports (red is
acceptable); `harness status` shows only genuinely open work.

## Phase 1: gates become policy

### G06 — `[gates]` policy: human, advisory, auto

**Work:** Add to `harness.toml`:

```toml
[gates]
spec  = "advisory"   # human | advisory | auto
plan  = "advisory"
merge = "human"      # the only permitted value
```

`human` is today's behaviour. `advisory`: the write guard and the bash redirect guard emit
`additionalContext` warnings instead of denials for `write-scope` and `draft-awaits-gate`;
`scope-drift` reports at `warn` severity in the commit stage and the PR check annotates rather than
fails; `harness status` shows `approval: missing` or `stale` as a row, never as an error exit.
`auto`: the driver (G09) writes `approved_by: policy`, `policy_digest`, and the timestamp into the
frontmatter, and the PR body lists it. Destructive-command rules, `protected-path`, `prefix-cache`,
`tamper`, `secrets` and `approve-is-the-humans` are unaffected by gate mode.

**Start here:** `.aidlc/lib/config.mjs:50`, `.aidlc/lib/guard.mjs:50-105`,
`.aidlc/checks/scope-drift.mjs:71-92`, `.aidlc/lib/artifacts.mjs:668`, `test/guard.test.mjs`,
`test/scope-drift.test.mjs`, `test/two-engineer-campaign.test.mjs`.

**Acceptance:** the two-engineer campaign passes in `human` mode unchanged and in `advisory` mode
with the out-of-scope write producing a warning row and a PR annotation instead of a refusal.
`docs/CONSTITUTION.md` Law 8 is amended: "gates are recorded at the edges; in advisory mode they
inform the merge decision rather than block the build loop".

### G07 — Spec approval no longer requires intent provenance

**Work:** `source` and `source_revision` become optional. When present, `sourceBinding` still
records digests and `read()` still reports staleness, but a missing or changed source yields
`binding: unbound` or `stale` as information, never an approval refusal. The `## Requirements`
table is checked only when present. `approve` still requires the artifact to be committed.

**Start here:** `.aidlc/lib/artifacts.mjs:82-143`, `:203-240`, `:402-475`,
`test/gate-content.test.mjs`, `test/requirement-traceability.test.mjs`.

**Acceptance:** an intent with no frontmatter beyond `status` reaches an approved spec and plan;
the traceability tests still pass when the table is present; `band-to-intent.mjs` output is
approvable without modification.

### G08 — Story intake from a tracker or PRD (absorbs F07)

**Work:** `harness new --from <https-url | path.md> [--split]`. Reads the document (an MCP-backed
tracker read is performed by the agent and passed as a file; the kernel takes a path or a URL
string only), writes one `intent.md` with `source` set, and with `--split` writes one child change
per `## Story` or acceptance-criteria group, each carrying `parent`. At PR open (G09) the driver
writes one comment back to the tracker through the project's configured MCP server, containing the
PR URL and candidate SHA. No tracker client enters the kernel.

**Start here:** `.aidlc/bin/harness:433`, `.aidlc/lib/artifacts.mjs:185`,
`.aidlc/skills/intent/SKILL.md`, `test/lifecycle-cli.test.mjs`.

**Acceptance:** a fixture PRD with three stories yields three child changes with `parent` and
`depends_on` where the PRD states an order; `harness status` shows the decomposition; the
playbook's single-source rule is documented in `OPERATING.md`.

**Phase 1 exit:** a change goes from intent to a merge-ready PR with zero `approve` commands under
`advisory` and with exactly two under `human`; the golden tasks record zero write refusals in
`advisory` mode.

## Phase 2: the delivery engine

### G09 — `harness deliver <slug>` (absorbs F10)

**Work:** The driver described in `.aidlc/artifacts/autonomous-delivery-loop/intent.md`. Phases,
each recorded in `.aidlc/state/deliver/<slug>/phases.json` before it starts and after it ends:

1. `implement`: the `implement` skill on the generator in a forked context, scoped to the plan.
2. `check-stop`: `harness check --stage stop`; on failure, one repair turn, then stop.
3. `refactor`: one generator turn under green checks, no behaviour change.
4. `review`: `harness review` with the scoped export from G02.
5. `repair`: at most two generator turns addressing Blocking and Important findings; the second
   escalates to the evaluator model (G10).
6. `check-commit`: `harness check --stage commit`.
7. `pr`: `gh pr create` with the `Harness-Change:` line, the approval rows, the review verdict and
   the ledger invocation id. Stop.

Bounds from `[deliver]` in `harness.toml`: `max_minutes`, `max_usd`, `max_repairs`. The driver
stops and names the bound. It refuses to start if the plan digest differs from the one recorded in
`phases.json`, and refuses to run `approve` or `merge` under any flag. `AIDLC_UNATTENDED` is set
for every model turn so skills never end on a question.

**Start here:** `.aidlc/bin/harness`, a new `.aidlc/lib/deliver.mjs` (Law 2: control flow in the
CLI layer), `evals/lib/campaign.mjs` for the phase-record pattern, `test/lifecycle-cli.test.mjs`.

**Acceptance:** with a fake invoker, the driver runs all seven phases, resumes from phase 4 after
a simulated kill, refuses on a changed plan digest, and stops on each bound. Live: one
`campaign-ledger` sprint delivered with one human action, the PR review.

### G10 — Model and effort per stage (absorbs F03)

**Work:** `[models]` gains `judgment = "claude-opus-5"` (defaults to `evaluator`). `init` renders
`judgment` into the `intent`, `spec`, `plan` and `design` skills and `evaluator.md`; `generator`
into `implement`. `[effort]` gains `implement = "low"`, `repair = "medium"`, `review = "high"`,
rendered into the same frontmatter. The second repair attempt runs on `judgment`.

**Start here:** `.aidlc/harness.toml:64`, `.aidlc/lib/config.mjs:57`, `.aidlc/lib/projection.mjs:42`,
`.aidlc/bin/harness:198-205`, `test/contracts.test.mjs`.

**Acceptance:** the existing "generator and evaluator must differ" test extends to "judgment and
generator must differ"; rendered frontmatter is asserted for all six prompt files; the ledger row
for each driver phase names the model and effort used.

### G11 — Stable session prefix; one full suite per iteration (absorbs F09)

**Work:** Reorder `sessionContext` so every volatile line (ledger row count, noisy controls, map
age, open-change list) sits after every stable line, and drop the row count. The Stop hook runs
`fast` plus `test --changed` only; the driver owns the full suite. `[stages]` gains
`stop_hook = ["fast", "test_changed"]`.

**Start here:** `.aidlc/lib/session.mjs:30`, `.aidlc/hooks/dispatch.mjs:171`,
`.aidlc/harness.toml:23`, `test/autogate.test.mjs`, `test/stop-guard.test.mjs`.

**Acceptance:** two consecutive SessionStart payloads differ only after the last stable line;
`baseline capture` records the new `session_context_tokens`; Stop hook wall-clock on this repo
drops below 20 s.

**Phase 2 exit:** one sprint delivered end to end with one human action; cost per accepted change,
cache-read share, and wall-clock recorded in the ledger and in the sprint's `review.md`.

> **Shipped 2026-09-15 — met.** First real `harness deliver --live`: campaign-ledger sprint 1, seven
> phases, review approve after one repair, USD 1.14 per accepted change, cache-read share 90%,
> wall-clock 287 s, in the `deliver-run` ledger row and `## Delivery run` of review.md. The one
> human action is the PR, which the fixture cannot host (`pr_unopened`, body in `pr.md`). Evidence
> and eight numbered findings: `evals/evidence/deliver-first-run-2026-09-15/README.md`. Getting
> there took three live attempts and five machinery fixes (9d3a859, 4298956, 9905abf, ba24099).

## Phase 3: product-facing sensors and guides

### G12 — Toolchain detection fills the capability verbs (absorbs F12)

**Work:** `harness init` inspects the target for `package.json`, `tsconfig.json`, `pyproject.toml`,
`requirements.txt`, `go.mod`, and writes non-empty verbs it can see the tooling for: TypeScript
(`tsc --noEmit`, `eslint` with `complexity`, `max-lines-per-function`, `max-params` at documented
thresholds, `vitest --coverage` or `node --test`), Python (`ruff check`, `mypy`, `pytest --cov`).
Anything it cannot see stays empty and `skipped`.

**Start here:** `.aidlc/bin/harness:150-243`, `.aidlc/templates/harness.toml`,
`examples/scratch-ts`, `examples/scratch-py`, `.github/workflows/harness.yml:85-110`.

**Acceptance:** CI's `cost` job gains a TypeScript twin; both examples run every rendered verb;
`harness doctor` lists none as `skipped` in either example.

### G13 — Coverage ratchet replaces `test_quality`

**Work:** `baseline.capture` records `coverage_lines_pct` per capability format (`lcov`,
`coverage.py` JSON); `compare` fails on a drop beyond tolerance. Delete
`.aidlc/sensors/test-quality.mjs`; the `behaviours_have_tests` assertion moves from the eval library
into a `proof` check in the commit stage.

**Start here:** `.aidlc/lib/baseline.mjs`, `.aidlc/lib/normalize.mjs`, `evals/lib/campaign.mjs`
(`behavioursHaveTests`), `.aidlc/harness.toml:26`, `[deterrents]`.

**Acceptance:** a planted coverage drop fails the commit stage in `scratch-ts`; a plan with a
behaviour lacking a proof row fails `proof`; `[deterrents]` names the tests.

### G14 — Opt-in mutation, SAST and layering verbs

**Work:** Documented commands for `mutation` (`stryker run --incremental` / `mutmut run`), `sast`
(`semgrep --config auto`), `layers` (`depcruise` / `lint-imports`), each normalised into the finding
schema. None is in a default stage; `OPERATING.md` describes adding them to `commit` when the
project is ready.

**Start here:** `.aidlc/lib/normalize.mjs`, `.aidlc/templates/harness.toml`, `docs/OPERATING.md`.

**Acceptance:** in `scratch-ts`, a planted surviving mutant and a planted layer violation each
produce one finding with file and line; the pack-bench and unit jobs are unaffected.

### G15 — Findings carry a fix line; suppressions reported on the PR

**Work:** Every normaliser fills `fix` with one sentence written for the model, following the
sensors article ("make a judgment call; suppress with a `why:` if the rule is wrong here").
`tamper` findings with a `why:` are collected into a `## Suppressions` section of the PR body by
the driver.

**Start here:** `.aidlc/lib/normalize.mjs`, `.aidlc/checks/tamper.mjs`, `.aidlc/lib/deliver.mjs`.

**Acceptance:** the rendered report for each check shows a `fix` line; a PR opened by the driver
on a diff with one justified suppression lists it.

### G16 — `design` skill replaces `map`; CLAUDE.md template gains Commands and Verification

**Work:** Fold the five graph questions of `map/SKILL.md` into a short section of
`instructions.md`. Add `.aidlc/skills/design/SKILL.md`: brainstorm the outcome in short questions,
resolve design branches before writing, and produce the spec's Entities, Approach, Structure and
Safeguards sections in the REASONS shape. Runs on `judgment`. Skill count stays at seven. The
project-instructions template gains a `## Commands` block with expected healthy output and a
`## Verification` block.

**Start here:** `.aidlc/skills/`, `.aidlc/instructions.md`, `.aidlc/templates/project-instructions.md`,
`.aidlc/templates/spec.md`, `test/skills-context.test.mjs`, `test/contracts.test.mjs`.

**Acceptance:** budget check passes at seven; the `clarify-ambiguous` and `intent-not-solution`
golden tasks pass with the new skill; the spec template renders the four sections.

**Phase 3 exit:** both examples run every verb in CI; a planted mutant and a planted layer
violation are each caught; the skill budget is at seven.

## Phase 4: deploy and maintain edges

### G17 — Consumer CI template with headless review (absorbs F14)

**Work:** `docs/OPERATING.md` and `harness init --ci` ship `.github/workflows/harness.yml` for a
consumer: on PR, `harness check --stage fast --base --candidate`; then `claude -p` on the evaluator
model with `--output-format json --json-schema .aidlc/schemas/review-findings.schema.json`,
`--tools Read,Grep,Glob`, posting one comment per PR with findings deduped against prior comments
and a `detected_pattern` per finding. Branch protection with code-owner review is documented as
the merge gate; the harness never approves.

**Start here:** `.aidlc/lib/review.mjs`, a new `.aidlc/schemas/review-findings.schema.json`,
`docs/OPERATING.md:298`, `evals/fixtures/_base`.

**Acceptance:** the template validates against `gh workflow view`; a test feeds a stored review
JSON through the dedupe and comment rendering; one live PR on `scratch-ts` receives the comment.

### G18 — Release record replaces the environment variable

**Work:** `productionDenied` reads `.aidlc/state/release.json` (`candidate`, `approved_by`, `at`,
`expires`) and allows only when the candidate SHA matches HEAD and the record is unexpired. Every
allow and deny is a ledger row with `reason` and `route` ("run `harness release approve --by`").
`harness release approve|revoke` is the verb; `approve-is-the-humans` covers it. `CLAUDE.md`
template gains a one-line rollback command slot.

**Start here:** `.aidlc/lib/guard.mjs:134`, `.aidlc/hooks/dispatch.mjs:49`, `.aidlc/bin/harness`,
`test/block-rules.test.mjs`.

**Acceptance:** `deploy prod` denied without a record and allowed with one, both rows in the
ledger with reasons; an expired record denies.

### G19 — Maintain edge closes (absorbs F15)

**Work:** `band-to-intent.mjs` writes `source: <bands file>` and `source_revision` when the bands
file is committed, and calls `harness new eval <slug>` with the breach as the fixture seed. A test
drives a 3-sigma breach through G07's relaxed approval into G09's driver with a fake invoker.

**Start here:** `examples/maintain/band-to-intent.mjs`, `.aidlc/bin/harness:433`,
`test/install.test.mjs:60`.

**Acceptance:** breach → intent → approved spec → driver start, all in one deterministic test.

**Phase 4 exit:** the consumer template reviews a PR; a prod deploy is gated by a record; a breach
becomes an intent the driver accepts.

## Phase 5: evals that run, and the vibe-coding comparison

### G20 — Live boundary restored (absorbs F16)

**Work:** Remove `const available = false` and the invoker's throw. Boundary policy: in CI the
ephemeral runner is the boundary (nightly, `CLAUDE_CODE_OAUTH_TOKEN`, `--max-cost-usd`, results
uploaded); locally, `--live --products` requires `--sandbox local`, which stages the fixture in a
temp worktree and runs the agent with a settings overlay denying Bash outside that path and
disabling all MCP servers. No Docker.

**Start here:** `evals/run.mjs:385`, `evals/lib/invoker.mjs:33-70`, `evals/lib/stage.mjs`,
`test/product-trials.test.mjs`, `test/no-container.test.mjs`.

**Acceptance:** `campaign-ledger` runs live in the nightly job and locally under `--sandbox local`;
the "refuses on the host" test becomes "refuses without a boundary".

### G21 — Golden tasks in the `claude plugin eval` layout

**Work:** Generate `evals/cases/<task>/prompt.md` and `graders/*.md` from `evals/tasks.json` for the
assertions that map to free graders (`file_exists`, `regex`, `tool_used`, `tool_order`); keep
`run.mjs` for `fixture_tests_pass`, `harness_stage_passes`, `under_baseline`, and the campaigns.
CI runs `claude plugin eval . --trust-plugin --json --threshold 0.8 --model <evals>
--judge-model <evals> --max-cost-usd 10`. The WITH/WITHOUT delta is recorded as
`contribution` in `evals/evidence/`.

**Start here:** `evals/tasks.json`, `evals/lib/assertions.mjs`, `.github/workflows/harness.yml`.

**Acceptance:** the generated suite validates with `claude plugin eval --dry-run`; one nightly run
records `aggregates.meanDelta`; the two layouts agree on pass/fail for every shared task.

### G22 — Spec-compliance LLM grader for campaigns

**Work:** One `llm` grader on the evaluator model, 2-of-3, rubric: "every approved `### B<n>` is
observable in the product and no superseded behaviour is presented as current". Applied to each
campaign sprint's staged copy, recorded beside the deterministic product assertions, never
replacing them.

**Start here:** `evals/lib/campaign.mjs`, `evals/run.mjs`, `evals/products.json`.

**Acceptance:** sprint 3 of `campaign-ledger` (rule reversal) is graded by the rubric and the
verdict is stored with the votes; a seeded product that still documents the old rule fails it.

### G23 — Green baseline and a blocking nightly gate

**Work:** For each of the 7 failing and 2 flaky tasks: fix the steering, or retire the task with
a reason in `evals/README.md`. Then `harness evals gate --update`. Flip G04's
`continue-on-error` off; Law 9 reads "(enforced: nightly CI)".

**Start here:** `evals/expected.json`, `.aidlc/lib/eval-gate.mjs:145`, the three failing task
fixtures.

**Acceptance:** `expected.json` shows zero `fail` and zero `flaky`; the next nightly run passes
the gate; a deliberately regressed task fails it.

### G24 — Native comparison on calculator (absorbs F05, F17)

> **Subject changed 2026-09-16, on the operator's instruction.** It read `campaign-ledger`, and
> the measurement it asked for could not be afforded: five sprints × three repetitions × two arms
> was USD 28–32 and 3–4 hours, declined on 2026-09-15. `campaign-ledger`, `campaign-service` and
> `retrieval-app` are deleted. `calculator` — React + TypeScript, three intents in two sprints —
> replaces all three. Three repetitions of both arms is now ~18 driver runs rather than ~30 on a
> five-sprint product, and the arms exercise `fmt`, `lint`, `typecheck` and `coverage`, which no
> previous measurement ever did because no previous product had them.

**Work:** Run the `native` pair on `calculator`, three paired repetitions, with the driver
from G09 in the harness arm. Record cost per accepted change, acceptance, evaluator-caught defects
and wall-clock in `evals/evidence/comparison-summary.json`.

**Acceptance (all three):** acceptance at least equal to native; cost per accepted change at
most native plus 10%; at least one evaluator-caught defect per campaign that the native arm
shipped. If any fails, the graph decision (freeze or delete) and the gate defaults are revisited
before phase 6.

**Phase 5 exit:** G24's three criteria hold.

> **Pilot 2026-09-15 — not met, and not yet measured at three repetitions.** `--comparison driver`
> exists (`evals/lib/driver-campaign.mjs`); `--repeats 0` ran each arm once on sprint 1 inside
> the operator's 30-minute bound. Verdict: `evals/evidence/g24-driver-comparison.json`.
> Acceptance 1 = 1, yes. Cost 1.14 vs ceiling 0.18, no — 6.3× over, two evaluator reviews are 66%
> of it. Evaluator-caught defect per campaign: 1, but native shipped none the grader caught in
> sprint 1, so no. The plan's mandated response is to cut; the pilot is one sprint and one
> repetition, so the cut list is recommended, not applied. The full three-repetition run is
> USD 28–32 and 3–4 hours by the pilot's numbers; the operator declined that spend on 2026-09-15.
>
> **Cut list applied 2026-09-15 (65a94ec), pilot rerun:** no refactor turn, one review with one
> unreviewed repair, no shell for the generator. Driver 0.548 per accepted change (was 1.140),
> 2.0 min (was 4.8), 0 denied commands (was 7); cost criterion still no at 2.8× the ceiling
> (was 6.3×) — the one evaluator review is 61% of what is left. Six phases now.
>
> **Measured on `calculator`, 2026-09-16 — all three criteria NO.** Three pilots, USD 1.77 total,
> each inside the operator's 30-minute bound. Run 3 is the only one where both arms completed:
> native 1 accepted change for USD 0.138 in 55 s; the harness arm 0 accepted changes for USD 0.546.
> Acceptance 0 vs 1, no. Cost undefined against a ceiling of 0.152, no. Evaluator-caught defects
> that native shipped, zero, no. Evidence and the cut list:
> `evals/evidence/g24-calculator-pilots-2026-09-16/README.md`. The mandated response is to cut, and
> the cut list is there — led by "do not repair on a review with no blocking findings", which is
> what turned run 3's green change into no delivery. Phase 5 does not exit.
>
> **The fixture replaced, 2026-09-16.** The pilot numbers above were measured on
> `campaign-ledger` sprint 1 and are kept as history; they do not transfer. What carried over is
> the cut list (no refactor turn, one review, no shell) and the shape of the answer: acceptance
> yes, cost no, evaluator-caught-defect no. Nothing is re-measured until the calculator arms run,
> and no criterion is marked met before then.
>
> Two things the cut lost, both for the operator to weigh rather than for this plan to decide:
> the `retrieval` comparison pair had a purpose-built fixture (`retrieval-app`, two modules
> exporting the same name) and now has nothing to run on, so the graph's disputed value is
> unmeasured; and `spec-compliance.mjs`, the supersedes grader, was written for a rule reversal
> that the calculator's two sprints do not contain.
>
> **Baseline (G23) 2026-09-15:** not re-recorded. No nightly run has ever fired (no schedule on
> main, no secret, branch unpushed). The last full local run (2026-09-14, 17/1/4) cannot be
> recorded because `prefix-cache-guard` regressed against the 2026-09-06 record and the ratchet
> refuses to lower it; rerun alone at HEAD it still fails — the guard is right, the eval model
> relays the remedy and drops the reason. Gate stays non-blocking. F9 in the evidence README.

## Phase 6: bounded improvement loop

### G25 — Playbook metrics from git and the ledger

**Work:** `harness ledger metrics` prints: first-pass CI success rate, rework cycles per change
(review rounds), time from plan approval to PR open, spec edits after first plan, escaped versus
caught defects (from `new eval` incidents), repeat incident class, and eval mean delta trend.

**Start here:** `.aidlc/lib/ledger.mjs:124`, `.aidlc/lib/deliver.mjs` phase records,
`evals/evidence/`.

**Acceptance:** each metric has a unit test over a fixture ledger; `OPERATING.md` weekly section
lists the command.

### G26 — Nightly guidance experiment loop

**Work:** `evals/experiment.mjs`: reads `evals/experiments/program.md`, makes one change to one
steering file, commits, runs the golden suite at fixed cost, compares `meanDelta` to the previous
line of `evals/experiments.tsv`, keeps the commit on a branch or resets, appends a line, never
asks. Budget-capped, one experiment per night, runs only when G23's gate is green.

**Acceptance:** with a fake invoker the loop keeps an improving change and resets a regressing
one; the tsv has one row per run; no experiment can touch a file outside the steering set.

**Phase 6 exit:** none by design.

## Appendix: disposition of the 10 September backlog

| Old | Disposition |
|---|---|
| F01, F04, F18 | Shipped before this plan; completion recorded by G03 |
| F02 | Covered by the driver's bounds in G09 |
| F03 | G10 |
| F05 | G24 |
| F06 | Dropped. The kernel is 5.5k lines; extraction is not the constraint, the missing engine is |
| F07 | G08 |
| F08 | Replaced by G06. Ownership stays declared; it stops blocking in advisory mode |
| F09 | G11 |
| F10 | G09 |
| F11 | Deferred. Risk-proportional review needs the routing evidence G24 produces first |
| F12 | G12, G13, G14 |
| F13 | Deferred to after G24; add a `perf` verb the same way as G14 when a product needs it |
| F14 | G17, G18 |
| F15 | G19 |
| F16 | G20, G21 |
| F17 | G24 |
