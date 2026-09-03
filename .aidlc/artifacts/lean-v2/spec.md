---
status: approved
migrated_from: sha256:b2cda61e9eef4be4b23d9b7af42607eb13a61babb75337958e574c3230406773
by: cwijayasundara
at: 2026-09-03T17:56:27.798Z
digest: sha256:b9ab61227d8adab66525b9547a8366384732dafae22bce0393a4d2c300dd8af5
---
# Spec: lean-v2

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

Given `.aidlc/harness.toml` `[models] generator = "claude-sonnet-5"`,
`evaluator = "claude-opus-5"` and `evals = "claude-haiku-4-5-20251001"`,
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
Then the 20-task suite runs on `[models] evals`, Haiku 4.5, under a spend cap of 5 USD per run, `harness evals gate` fails on any task in `expected.json` that
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
