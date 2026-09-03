# Delivery contract: lean-v2

- **Schema:** aidlc.contract/v1
- **Change id:** lean-v2
- **Intent ref:** ../intent-refs/lean-v2.json
- **Story ref:** none
- **Risk:** standard
- **Spec status:** approved
- **Spec approval digest:** sha256:b2cda61e9eef4be4b23d9b7af42607eb13a61babb75337958e574c3230406773
- **Plan status:** draft
- **Plan approval digest:** pending

## Outcome

The harness is ~2,200 kernel lines, every one reachable from a stage. A feature moves through
`intent.md -> spec.md -> plan.md -> diff -> review.md` with three human gates. The generator and
the evaluator are different models in different contexts by construction. The code map cannot go
stale silently. A real application has been built through the harness for three sprints, and its
ledger, not the harness's, decides the next control. This is the last contract in the current
two-seal format; the change it governs replaces that format.

## Observable behaviours

### B1

**reachability**

Given the kernel after the cut,
When `test/contracts.test.mjs` walks every module under `.aidlc/lib`, `.aidlc/checks`,
`.aidlc/sensors` and `.aidlc/hooks`,
Then each is imported, transitively, by `.aidlc/bin/harness`, `hooks/dispatch.mjs`, or a control
named in a `[stages]` entry, and the test fails naming any module that is not.

### B2

**the cut**

Given the subsystems listed under Structure and ownership as deleted,
When the suite runs after the last deletion PR,
Then no file under `.aidlc/providers`, `.aidlc/mcp`, `.aidlc/archive` exists; `lib/` has no
`work-items`, `operations`, `incidents`, `agent-adapters`, `model-policy`, `gauntlet`,
`indicators`, `contract-chain`, `review-adapter`, `wiki` module; `bin/harness` prints exactly
eight top-level verbs (`init doctor check status ledger map new approve`); `.github/workflows`
holds `harness.yml` and `evals.yml` only; `docs/` holds `BUILD-PLAN.md`, `CONSTITUTION.md`,
`OPERATING.md` only; and `docs/schemas/` does not exist.

### B3

**one budget**

Given every markdown file in the repository,
When the suite greps for a skill, agent or hook count,
Then the only numbers found equal `[limits]` in `.aidlc/harness.toml` (skills 7, agents 3,
hooks 5), and `check --stage commit` passes with the budget spent, not exceeded.

### B4

**three artifacts, one approval verb**

Given `harness new <slug>`,
When it runs,
Then `.aidlc/artifacts/<slug>/intent.md`, `spec.md`, `plan.md` exist from templates with
`status: draft` frontmatter. Given `harness approve <slug> spec|plan --by <name>`, When the file
is committed, Then the frontmatter gains `status: approved`, `by`, `at`, and `digest` of the
body; when the file is uncommitted it refuses with "commit the artifact before approving it";
`approve plan` refuses while the spec is not approved. Given an approved artifact whose body no
longer matches its digest, When `harness status` runs, Then it reports the artifact as
`stale-approval` and `scope-drift` treats its plan as owning nothing.

### B5

**ownership from the plan**

Given `plan.md` with a `## Files` section listing backtick paths,
When `scope-drift` and the write guard run,
Then ownership is read from that section of every committed approved plan and from nowhere else.
The contract format of `aidlc.contract/v1` is no longer read; the 23 existing contracts are
split by `scripts/migrate-contracts.mjs` into the three-file layout with their original approval
digests carried into frontmatter as `migrated_from`, and no approval is invented.

### B6

**gates at the edges**

Given a plan that lists `.aidlc/harness.toml` or `evals/fixtures/**` under `## Files` and is
approved and committed,
When the agent edits that file,
Then the write guard allows it. The prompt-prefix refusal applies only to `.claude/CLAUDE.md`,
`.claude/settings.json` and `.aidlc/instructions.md`, and only mid-session.

### B7

**generator and evaluator by construction**

Given `.aidlc/harness.toml` `[models] generator = "claude-haiku-4-5-20251001"` and
`evaluator = "claude-opus-5"`,
When `harness init` renders the Claude projection,
Then `implement/SKILL.md` carries `model:` = generator and `context: fork`;
`roles/evaluator.md` carries `model:` = evaluator, `tools: Read, Grep, Glob, Bash`,
`isolation: worktree`, `maxTurns: 40`; and `test/contracts.test.mjs` fails if the two `model:`
values are equal or if the evaluator gains `Write` or `Edit`. Given a skill or agent invocation,
When it ends, Then the ledger holds a row `{control: "invoke", role, model, ms}`.

### B8

**the evaluator writes the review**

Given an approved plan and a diff on a branch,
When the `review` skill runs,
Then it spawns `evaluator` in a fresh worktree, which writes
`.aidlc/artifacts/<slug>/review.md` where each finding cites a `spec.md` behaviour id or a
`REVIEW.md` pass and carries a severity; `changes-requested` returns to `implement` at most twice
before the human is asked; the evaluator's session never runs `Write` or `Edit`.

### B9

**the ledger can say why**

Given any guard or check firing,
When the row is appended,
Then it carries `rule` (the rule id that fired) and `fix` text; given
`harness ledger flag <run> <control> --false`, Then the row gains `false: true`; and
`ledger audit` reports true-positive rate per rule, listing any rule whose fires are more than
half flagged false as `noisy — fix or delete`.

### B10

**tamper and test-deletion sensors**

Given a diff,
When `check --stage commit` runs,
Then `tamper` fails on: a raised numeric threshold in any lint, coverage or complexity config
named by `[capabilities]`; an added `eslint-disable`, `# noqa`, `# type: ignore`, `@ts-ignore`
or `harness:allow-*` marker without a same-line `why:`; a deleted or emptied test file not listed
in the approved plan's `## Files`. Each finding names the rule and the line.

### B11

**the map is a guide with a drift sensor**

Given `harness map`,
When it runs,
Then it writes `CODEBASE-MAP.md` at the repository root, at most 200 lines: purpose line,
layer order, top hubs by in-degree with one-line roles, cycles, and "start here" for the three
largest modules. Given the Stop hook, When the regenerated map differs from the committed one,
Then the ledger records `map-drift: fail` with the diff summary and the hook returns the
difference as context; the suite fails if the committed map is stale on the harness's own tree.
Given SessionStart, Then two lines are injected: map age in commits and the top five hubs.

### B12

**evals run in CI on steering changes**

Given a PR that touches `.claude/CLAUDE.md`, `.aidlc/skills/**`, `.aidlc/roles/**`,
`.aidlc/hooks/**`, `.aidlc/templates/**` or `.aidlc/harness.toml`,
When `evals.yml` runs with `ANTHROPIC_API_KEY`,
Then the 20-task suite runs with the generator on Haiku 4.5 and the evaluator on Sonnet 5 under
a spend cap of 5 USD per run, `harness evals gate` fails on any task in `expected.json` that
regressed, and the run's single result file replaces the committed one. Other PRs skip the job.

### B13

**the example app goes through the harness**

Given a sibling repository `dunning` created by `harness init --into`,
When features F1 to F8 (below) are delivered over three sprints,
Then each has the three artifacts approved by the owner, a review.md from the evaluator, and a
ledger; `harness status` in that repository shows cost per feature by model; and the harness
repository's next intent after this contract cites a defect or false block recorded in the
`dunning` ledger.

## Out of scope

- Adapters for Codex, Cursor, Copilot or Grok. The control plane stays neutral (`.aidlc/`
  instructions, markdown skills, hook intents in `policy.json`, CLI with exit codes). An adapter
  lands only as a projection generator plus a conformance fixture, after a real feature has been
  built with that agent. Codex has no hooks; its projection binds the same checks to git hooks.
- Mutation testing. Not zero-dependency. `tamper` and the test-deletion rule are the cheap stand-in.
- Domain policy skills (security, compliance, brand). The playbook wants them; the example app
  will show which one is needed first.
- Deploy and Maintain subsystems. One paragraph each in `OPERATING.md` and one example script
  (`examples/maintain/band-to-intent.mjs`, fifty lines) that writes an `intent.md` on a band
  breach. Code returns when a real service produces a defect.

## Entities and existing context

- **Kernel kept** (`.aidlc/lib`): `runner` 168, `config` 70, `toml` 75, `normalize` 111,
  `paths` 74, `ledger` 142, `guard` 202, `contract` 276 (becomes `artifacts.mjs`, smaller),
  `graph` 355, `pack` 90, `refresh` 80, `baseline` 106, `eval-gate` 153 (shrinks), `worktree` 15.
  `checks/`: secrets 44, scope-drift 130, budget 98. `hooks/dispatch.mjs` 149.
- **Kernel deleted**: `work-items` 132, `operations` 188, `incidents` 75, `agent-adapters` 185,
  `model-policy` 133, `gauntlet` 107, `indicators` 150, `contract-chain` 204, `review-adapter` 76,
  `wiki` 66; `providers/` 224; `mcp/` 55; `bin/harness` verbs `work-items gauntlet agents models
  review github deploy monitor contract lock worktree pack wiki baseline hook` (~400 lines).
- **Ledger today**: 3,040 rows, 136 runs. `bash-guard` 1,554 invocations, 275 denials with no
  rule id; known false blocks on `2>&1`, `2>/dev/null`, `>` in commit trailers.
- **Graph today**: `.aidlc/state/graph-stale` marker present; wiki index names deleted
  `lib/lifecycle.mjs`; `graph-refresh` records 51 passes and no failures.
- **Pending contract** `dormant-sensors-run-at-commit`: red on main until the owner adds
  `arch` and `test_quality` to `commit` in `.aidlc/harness.toml` and
  `evals/fixtures/_base/.aidlc/harness.toml`. Landed first, before any deletion.
- **Claude Code primitives used**: skill frontmatter `model`, `context: fork`, `paths`; agent
  frontmatter `model`, `tools`, `isolation: worktree`, `maxTurns`; hook events `SessionStart`,
  `PreToolUse`, `PostToolUse`, `Stop`; headless `--bare --json-schema` for the eval runner.
- **Models**: generator `claude-haiku-4-5-20251001`; evaluator `claude-opus-5` locally,
  `claude-sonnet-5` in CI. A harness that steers Haiku to a passing eval is a stronger harness
  than one that needs Sonnet; the evaluator stays on a frontier model because judgment is the
  deliverable (Devin Fusion's own failure case).

## Approach and rejected alternatives

Delete first, reshape second, add sensors third, then build something real. Each deletion is one
PR with the suite green, so main is never red and the ledger keeps its history.

Rejected: a rewrite in a fresh repository. The kernel is good and its ledger has 3,040 rows of
history that a fresh repo would throw away; the problem is surface, not foundation.

Rejected: keeping the single two-seal contract and trimming its sections. The playbook's three
files are readable by a product owner who does not care about owned paths, and one approval verb
halves the ceremony commits. SPDD's seven sections survive as a checklist inside the `spec` skill.

Rejected: keeping the model-policy and handoff receipt machinery as the generator/evaluator
implementation. Claude Code frontmatter (`model`, `context: fork`, `isolation: worktree`) gives
independent contexts and independent models with zero harness code; the receipts recorded what
the ledger's `invoke` row now records.

Rejected: DeepWiki. External, refreshes only badged public repositories, and an MCP dependency for
information the local graph already has.

Rejected: agent teams or a persistent role swarm for the build loop. The docs say teams cost
significantly more tokens than subagents; the example app will show whether parallel worktree
sessions are ever needed.

## Structure and ownership

| Path | Change |
|---|---|
| `.aidlc/bin/harness` | 23 verbs to 8; `approve` and `map` added; `new` creates the slug directory |
| `.aidlc/lib/` | delete ten modules; `contract.mjs` becomes `artifacts.mjs`; `ledger.mjs` gains `rule`, `fix`, `false`, `invoke` rows |
| `.aidlc/checks/` | `scope-drift.mjs` reads `plan.md`; add `tamper.mjs` |
| `.aidlc/sensors/` | `architecture.mjs` forbids `providers/` and enforces layer order; add `map-drift.mjs` |
| `.aidlc/hooks/` | dispatch: SessionStart injects map summary; Stop runs map-drift |
| `.aidlc/skills/` | 10 to 7: `intent`, `spec`, `plan`, `implement`, `diagnose`, `change-safely`, `map`; `review` folds into `plan`/`evaluator` |
| `.aidlc/roles/` | `reviewer` becomes `evaluator` with model, worktree, maxTurns; explorer on `claude-haiku-4-5-20251001` |
| `.aidlc/templates/` | `intent.md`, `spec.md`, `plan.md`, `review.md` with frontmatter; delete `contract.md`, `bands.json`, `agents.json`, `model-policy.json`, `managed-settings.json`, `CODEOWNERS`; `harness.toml` gains `[models]` and loses `[sensors]`, `[work_items]`, `[monitoring]` |
| `.aidlc/providers/` | deleted |
| `.aidlc/mcp/` | deleted |
| `.aidlc/archive/` | deleted |
| `.aidlc/agents.json` | deleted |
| `.aidlc/model-policy.json` | deleted |
| `.aidlc/evals/` | results: keep the newest full run only |
| `.aidlc/policies/review.md` | becomes `REVIEW.md` template content |
| `.aidlc/instructions.md` | rewritten for the three-file chain |
| `.aidlc/harness.toml` | `[models]`, `[limits] skills = 7`, `commit` stage gains `tamper`; owner's edit between sessions |
| `.aidlc/artifacts/` | 23 contracts migrated to slug directories by `scripts/migrate-contracts.mjs` |
| `.claude/CLAUDE.md` | under 60 lines, three-file chain, eight verbs |
| `CODEBASE-MAP.md` | generated, committed, drift-checked |
| `scripts/migrate-contracts.mjs` | one-shot migration, deleted in the same sprint it runs |
| `docs/` | keep `BUILD-PLAN.md` (rewritten as design), `CONSTITUTION.md` (Law 5 numbers, new Law 11), `OPERATING.md`; delete the rest and `schemas/`, `handbook.html`, `analysis.html` |
| `README.md` | three-file chain, eight verbs, one budget |
| `test/` | delete tests of deleted modules; add reachability, budget-prose, approve, tamper, map-drift, model-split tests |
| `evals/` | `run.mjs` uses `[models]`; `expected.json` single-run; fixtures updated by the migration script |
| `examples/` | delete `docker-staging`, `collect-ci-failure-rate.mjs`; add `maintain/band-to-intent.mjs`; keep `scratch-py`, `scratch-ts` |
| `.github/workflows/` | keep `harness.yml`; add `evals.yml`; delete the other seven |

## Safeguards

- Ledger history is never rewritten; the schema change is additive (new optional fields).
- Every deletion PR runs `check --stage commit` green before merge; no PR deletes more than one
  subsystem so a bad cut is one revert.
- The migration script is idempotent and refuses to run if any target directory exists.
- Approval digests from the 23 old contracts are preserved verbatim as `migrated_from`; no
  `status: approved` is written by the script.
- CI spend cap of 5 USD per eval run and 2 USD per evaluator run, enforced by `--max-budget-usd`
  on the headless invocation; a cap breach is a failed job, not a silent pass.
- The evaluator's tool list is enforced by test, not prose; a worktree it did not write to is
  the independence guarantee.
- `tamper` reports and blocks; it never edits. False blocks are flagged in the ledger, not fixed
  by widening the rule silently.
- No new control enters the harness during this contract that is not named in B1 to B13.

## Operations

Sprint 0 — land and cut (harness repo, 3 to 4 days)

1. Owner adds `arch` and `test_quality` to `commit` in `.aidlc/harness.toml` and
   `evals/fixtures/_base/.aidlc/harness.toml`; commit; `check --stage stop` green; close
   `dormant-sensors-run-at-commit`.
2. Owner accepts this intent and seals spec and plan. Add Law 11 to `docs/CONSTITUTION.md`: a
   control enters only with a failing eval or a defect from a non-harness repository.
3. Deletion PR 1: `lib/work-items.mjs`, `providers/jira.mjs`, `mcp/`, `work-items` verb,
   `docs/WORK-ITEMS.md`, its tests and schemas, `[work_items]` in the template.
4. Deletion PR 2: deploy half of `lib/operations.mjs`, `providers/docker-compose.mjs`,
   `deploy` verb, `examples/docker-staging`, `harness-rehearse.yml`, `docs/DEPLOYMENT.md`.
5. Deletion PR 3: monitor half of `operations.mjs`, `incidents.mjs`, band tiers in `guard.mjs`,
   `monitor` verb, `templates/bands.json`, `harness-monitor.yml`, `harness-diagnose.yml`,
   `[monitoring]`; add `examples/maintain/band-to-intent.mjs`.
6. Deletion PR 4: `agent-adapters.mjs`, `agents.json`, `agents` verb, `templates/agents.json`,
   their tests; `init` renders only the Claude projection.
7. Deletion PR 5: `model-policy.mjs`, `providers/claude-code.mjs`, `model-policy.json`,
   `models` verb, `docs/MODEL-ROLES.md`, five schemas, tests.
8. Deletion PR 6: `gauntlet.mjs`, `gauntlet` verb, `docs/SENSOR-GAUNTLET.md`, `[sensors]`,
   `last-gauntlet.json`, tests.
9. Deletion PR 7: `indicators.mjs`, `contract-chain.mjs`, playbook block in `status`, tests.
10. Deletion PR 8: `review-adapter.mjs`, `github` verb, `claude-review.yml`, `claude-fix.yml`,
    `harness-intent.yml`, `harness-triage.yml`, `harness-protection.yml`, `templates/CODEOWNERS`,
    `templates/managed-settings.json`, `doctor --enterprise`.
11. Deletion PR 9: `wiki.mjs`, `wiki` verb, `pack` and `baseline` verbs folded into `map`;
    `contract migrate`, `rollback-migration`, `.aidlc/archive/`, `lock` and `worktree` verbs
    (worktree isolation is agent frontmatter now).
12. Deletion PR 10: eval overlay and cost ratchet in `eval-gate.mjs`; `expected.json` becomes
    "every listed task passes in the newest full run"; keep one result file.
13. Deletion PR 11: `docs/COMPANY-V1-IMPLEMENTATION-PLAN.md`, `PLAYBOOK-CONFORMANCE.md`,
    `PHASE-0-DECISIONS.md`, `CONTRACTS.md`, `handbook.html`, `analysis.html`, `docs/schemas/`;
    one budget number everywhere (B3 test lands here, red then green).
14. B1 reachability test lands; `sensors/architecture.mjs` extended to forbid `providers/`
    imports and enforce `toml -> config -> paths -> normalize -> ledger -> runner -> checks`.

Sprint 1 — reshape and split (harness repo, 4 to 5 days)

15. `templates/intent.md`, `spec.md`, `plan.md`, `review.md` with frontmatter; `harness new
    <slug>` creates the slug directory; `harness approve` (B4) with tests.
16. `lib/contract.mjs` becomes `lib/artifacts.mjs`: read frontmatter, verify digest, report
    `stale-approval`; `scope-drift` and `guard` read `plan.md ## Files` (B5, B6).
17. `scripts/migrate-contracts.mjs`: split 23 contracts, carry digests as `migrated_from`, update
    `evals/fixtures`; run once, commit, delete the script.
18. Skills 10 to 7; `spec` skill carries the SPDD checklist; `plan` skill writes `## Files`;
    `implement` gains `model:` and `context: fork` from `[models]` at `init` (B7).
19. `roles/reviewer.md` becomes `roles/evaluator.md` (B7, B8); `review` flow spawns it in a
    worktree; `review.md` written by the evaluator; repair loop capped at two.
20. `ledger.mjs`: `rule`, `fix`, `false`, `invoke` rows; `ledger flag`; audit per rule (B9).
    Classify the 275 historical `bash-guard` denials by re-running their commands through the
    new rule ids where the ledger holds the command text; leave the rest `unclassified`.
21. `.aidlc/instructions.md`, `.claude/CLAUDE.md`, `README.md`, `docs/BUILD-PLAN.md`,
    `docs/OPERATING.md` rewritten for the three-file chain and eight verbs.

Sprint 2 — sensors, map, CI (harness repo, 3 days)

22. `checks/tamper.mjs` and the test-deletion rule; wired into `commit` (B10).
23. `harness map` writes `CODEBASE-MAP.md`; `sensors/map-drift.mjs` at Stop; SessionStart
    injects the two-line summary; drop the per-cluster wiki output (B11).
24. `evals.yml` with path filter, `ANTHROPIC_API_KEY`, Haiku generator, Sonnet evaluator, spend
    cap; `evals/run.mjs` reads `[models]`; `harness.yml` keeps the unit suite and the pack bench
    (B12).
25. Port from v6 into `guard.mjs`: the shell write-bypass lexer cases (`tee`, `sed -i`, `cp`,
    `mv`, redirections) as named rules with the false-block fixes for `2>&1`, `2>/dev/null` and
    commit-trailer `>`.

Sprints 3 to 5 — the example app (sibling repo `dunning`, 2 to 3 weeks)

26. `git init ../dunning`; `harness init --into ../dunning`; TypeScript, Node 24 built-ins only
    (`node:http`, `node:sqlite`, `node:test`), dev deps `typescript` and `eslint`; fill the
    capability verbs; commit the install. Purpose: invoice reminders for a small business, a
    domain with real state transitions, a scheduled job and a metric the Maintain loop can watch.
27. Sprint A: F1 create customers and invoices with validation; F2 list overdue invoices with
    cursor pagination; F3 record a payment and drive `open -> partially-paid -> paid | overdue`.
28. Sprint B: F4 reminder rules at 3, 7 and 14 days overdue; F5 pluggable notifier (log and
    file-mail adapters) with idempotent sends; F6 `dunning run` CLI for the scheduled job.
29. Sprint C: F7 aging report (30/60/90) endpoint; F8 `overdue-rate` metric endpoint and
    `examples/maintain/band-to-intent.mjs` wired to it, so a breach writes an `intent.md` in
    `dunning`; F9 (stretch) CSV import of invoices.
30. After each sprint: `ledger audit` in `dunning`; record cost per feature by model, gate
    rejections, false blocks, evaluator findings by severity; the top defect becomes the next
    harness intent (B13). Any control the harness ledger alone proposes is refused.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/contracts.test.mjs` "every kernel module is reachable from an entrypoint or a stage" |
| B2 | `test/contracts.test.mjs` "the cut is complete": asserts the absence list and the eight verbs; `git ls-files` in the PR 11 evidence |
| B3 | `test/budget.test.mjs` "no prose states a budget other than harness.toml" |
| B4 | `test/artifacts.test.mjs`: new, approve, refuse-uncommitted, refuse-plan-before-spec, stale-approval |
| B5 | `test/scope-drift.test.mjs` reads `## Files` from a fixture plan; migration test on a copied contract |
| B6 | `test/guard.test.mjs`: owned registry file allowed; prefix file refused mid-session only |
| B7 | `test/contracts.test.mjs`: generator and evaluator models differ; evaluator has no Write/Edit; ledger `invoke` row in `test/unit.test.mjs` |
| B8 | `test/review.test.mjs` with a fake evaluator: findings cite ids; repair loop stops at two |
| B9 | `test/unit.test.mjs` ledger rows carry `rule`; `ledger flag`; audit lists `noisy` |
| B10 | `test/tamper.test.mjs`: raised threshold, bare suppression, deleted test, each named; allowed with `why:` and with plan listing |
| B11 | `test/graph.test.mjs`: map under 200 lines; drift fails when a hub file is deleted; committed `CODEBASE-MAP.md` matches regeneration on the harness tree |
| B12 | `evals.yml` run link in the PR evidence; `harness evals gate` red on a seeded regression fixture |
| B13 | `dunning` repository: 8 slug directories with approved artifacts and review.md; `harness status` output pasted per sprint into `.aidlc/artifacts/lean-v2/evidence` |
