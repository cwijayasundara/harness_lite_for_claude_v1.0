# Lean harness implementation backlog

Prepared 10 September 2026 from [the research proposal](LEAN-HARNESS-RESEARCH-PROPOSAL.md). This is the implementation handoff for Claude Code or Codex. The scope is **Plan → Design → Build → Test → Deploy → Maintain → new intent**, for greenfield and brownfield projects.

## Read this before starting

- Keep the harness small: native coding agents, project commands, Git, existing CI/CD and monitoring, plus a small dispatcher. Do not build a general orchestration platform.
- **No Anthropic API billing or API fallback.** Ordinary tests must invoke zero models. Live trials must be explicit and use verified subscription authentication. Do not read or print credential values.
- **No Docker prerequisite for unit or integration tests.** Use temporary directories, native subprocesses and ephemeral ports with project-supported local dependencies. Do not merely skip required integration coverage when Docker is absent. Container-based deployment may remain a product choice, not a harness testing requirement.
- Preserve intent/design/plan meaning and existing approval policy during the first rollout. Consolidating records or relaxing routine approval gates is a separate decision after evidence exists.
- Implement one independently verifiable item at a time. Suggested files below are starting points, not exact-path restrictions. Split an item if it stops fitting in one coherent PR.
- Preserve current edits. `CODEBASE-MAP.md` was already modified before this work. The subscription changes and research proposal are currently uncommitted; do not reset, overwrite or recreate them.
- Retain meaningful regression tests. File counts, line counts and test counts are not deletion targets. Keep historical evidence accessible without injecting it into every agent session.
- Treat implementation, offline verification, live verification and publication as separate states. Never mark a deployment or maintenance loop complete based only on a mock.

## Current handoff state

Already implemented locally: removal of automatic `.env` loading; subscription guard in `.aidlc/lib/claude-auth.mjs`; protection of evaluation and independent-review invocations; explicit `--live` for evaluation runners; a 30-turn invocation bound; and manual subscription-only CI smoke configuration. This is a starting patch to finish and review, not evidence that Max inference or hosted CI has been verified.

The execution environment reported no active Claude Code login. No inference calls were made. The hosted workflow and account settings have not been changed. Model selection still uses the existing generator/evaluator/evaluation IDs in `.aidlc/harness.toml` and `.aidlc/lib/config.mjs`.

Verification recorded in the proposal: a disposable clean clone ran 436 tests, with 423 passing, 12 skipped, and one clone-origin consistency failure. That remaining test passed after correcting the clone's origin metadata. A focused 32-test suite also passed in the working checkout. Tests that require a clean runtime may reject an edited checkout; use a disposable clone containing the candidate changes and original history, without weakening runtime identity checks.

## Work order

P0 prevents unexpected usage; P1 establishes the lean execution path; P2 completes the lifecycle and proves adoption. Dependencies refer to completed implementation, except where a bounded pilot is explicitly sufficient.

| ID | Priority | Fix / deliverable | Status | Depends on |
|---|---|---|---|---|
| F01 | P0 | Finish and publish the subscription-only billing fix | Local patch; review/setup/publication pending | — |
| F02 | P0 | Bound live runs and pause cleanly on quota/auth failures | Partial: invocation turn cap exists | F01 |
| F03 | P1 | Make model selection explicit and portable | TODO | F01 |
| F04 | P1 | Eliminate duplicate test execution | TODO | — |
| F18 | P0 | Remove Docker dependency from unit/integration tests | TODO | — |
| F05 | P1 | Establish pilot commands and a native-agent baseline | TODO | F18; F01–F03 for live baseline |
| F06 | P1 | Extract the minimal installed harness | TODO | F04, F05 |
| F07 | P1 | Preserve concise stage records and PRD-to-slice planning | TODO | F06 |
| F08 | P1 | Replace predicted file ownership with meaningful boundaries | TODO | F07 |
| F09 | P1 | Reduce session context and hooks | TODO | F06, F08 |
| F10 | P1 | Implement resumable stage dispatch through reviewed PR | TODO | F02, F07–F09 |
| F11 | P1 | Make independent review proportional to risk | TODO | F03, F07 |
| F12 | P1 | Add project correctness, architecture and security checks | TODO | F05, F07 |
| F13 | P1 | Add measurable performance budgets | TODO | F05, F07 |
| F14 | P2 | Connect deployment and release verification | TODO | F10–F13 |
| F15 | P2 | Close the maintenance-to-fix loop | TODO | F14 |
| F16 | P2 | Replace broad repeated campaigns with outcome-focused trials | TODO | F05; final coverage after F15 |
| F17 | P2 | Validate two-engineer use and decide adoption | TODO | F01–F16, F18 |

Suggested sequence: finish F01–F03; land F18 and F04; establish F05; extract F06; complete F07–F13; then F14–F17. F18 is appended as a stable ID for the user's additional no-Docker requirement. Prepare F16's trial definitions during F05 so they guide implementation. Keep live trials small and selected throughout.

## Fix details

### F01 — Finish the subscription-only billing fix

**Work:** Review the existing patch rather than replacing it. Inspect every native Claude invocation, credential preflight, settings inheritance, container credential boundary, and CI trigger. Ensure an API key, API helper, alternate provider or profile cannot silently select paid API execution. Preserve explicit refusal rather than silently changing authentication.

**Start here:** `.aidlc/lib/claude-auth.mjs`, `.aidlc/lib/review.mjs`, `evals/run.mjs`, `evals/lib/invoker.mjs`, `evals/agent-mechanisms.mjs`, `.github/workflows/harness.yml`, and their tests.

**Acceptance:** Offline regression tests cover API/OAuth conflicts, missing login, rejected configuration, dry-run behavior, and no credential leakage. Ordinary PR checks need no model secret or Docker. An explicitly requested bounded smoke works with the user's Max login; non-interactive environments use the supported subscription token path where needed. Record any unverified authentication case. Publish the reviewed workflow through the normal repository process; inspect required checks so an obsolete mandatory live-eval check cannot strand PRs. Publication and account sign-in must be recorded separately from code completion.

### F02 — Bound live work and handle exhausted usage

**Work:** Audit invocation and campaign limits across all runners. Keep finite time/turn/attempt limits, one campaign at a time initially, and at most two repair attempts. Stop scheduling new calls after authentication failure or exhausted quota. Persist the current stage and next action so work resumes without repeating successful calls. Label reported USD as usage estimates when subscription-backed; never present them as an invoice or guaranteed account spending cap.

**Start here:** `evals/run.mjs`, `evals/lib/invoker.mjs`, campaign/comparison modules, mechanism smoke, and the review runner.

**Acceptance:** Fake CLI responses for quota exhaustion, timeout, auth failure and malformed output demonstrate bounded execution, accurate incomplete status and resumable state. No branch switches to API credentials. A dry preview lists selected work, models and limits without inference. Retrying does not repeat a completed phase unnecessarily.

### F03 — Make model choice an operator decision

**Work:** Separate authentication from model selection. Allow normal development to use the user's native-agent choice, with explicit overrides for controlled trials. Remove the assumption that the reviewer must use a different model; preserve separate context and read-only access. Keep exact version pins where reproducibility requires them.

**Start here:** `.aidlc/harness.toml`, `.aidlc/lib/config.mjs`, model projections generated during installation, invoker/review argument builders, `test/contracts.test.mjs`.

**Acceptance:** Config/default/override precedence is documented and tested offline. Requested and actually reported models are distinguishable. Unavailable models fail clearly without silent substitution. Same-model independent review is permitted. Native and harness comparison arms use the same model and effort. Do not add another provider SDK merely to select a model.

### F04 — Run each required check once

**Work:** Remove `baseline.capture()`'s recursive execution of the full `stop` stage when the enclosing commit check already executed it. Reuse evidence only when its candidate, command/configuration and relevant environment still match; otherwise rerun the necessary check. Preserve an explicit standalone-check path where required.

**Start here:** `.aidlc/lib/baseline.mjs`, check runner/stage resolution, `.aidlc/harness.toml`, budget/baseline tests.

**Acceptance:** A stub counter proves the main suite executes once for a normal commit check. Failures still block verification. Changed source/configuration invalidates reused evidence. Show before/after elapsed time on the same local workload; this requires no model call.

### F05 — Establish pilot commands and a fair baseline

**Work:** Select one greenfield and one brownfield pilot. If real repositories are not yet selected, use the existing ledger/service fixtures for bounded development and label them as fixtures. Expose bootstrap, run, fast-check and full-check commands over existing project tooling. Exercise one real API/browser/CLI journey. Define the 8–12-task comparison portfolio before changing agent guidance substantially.

**Start here:** `examples/`, `evals/fixtures/`, existing capability configuration and project build scripts.

**Acceptance:** A fresh checkout starts and verifies with documented commands. Missing dependencies and skipped tests are reported honestly. Brownfield baseline records inherited failures and characterization tests. Record native-agent results only from explicitly requested subscription trials. Baseline tasks, acceptance criteria and environment are reusable for F16.

### F18 — Remove Docker from the unit/integration test path

**Work:** Replace Docker-backed test setup with disposable local fixtures and native child processes. For the existing Node ledger/service examples, use temporary data files/directories, ephemeral HTTP ports, real requests and deterministic teardown. Keep fake model invocations for harness tests. Use a real local database when database-specific behavior is the subject of a test; do not substitute SQLite or mocks and claim equivalent database semantics. Unit tests may fake external boundaries; integration tests must exercise the declared real component boundary.

**Start here:** `evals/lib/stage.mjs`, `test/product-trials.test.mjs`, Docker-related environment skips, `.github/workflows/harness.yml`, example bootstrap/check commands and evaluation documentation. Inspect `evals/Dockerfile` users before deciding whether it remains optional research infrastructure. Coordinate changes to the shared stage helper with the live invoker; removing a test dependency must not silently remove its existing agent security boundary.

**Acceptance:** On a machine with no Docker executable or daemon, all required unit and integration tests run and pass, including the previously Docker-gated product behavior tests. CI neither installs Docker nor builds a test image for these suites. Concurrent runs use isolated data/ports; failures and timeouts clean up child processes. Report any remaining external-service test as a separate opt-in suite, not ordinary integration coverage. A directory, worktree or subprocess is not an OS sandbox: preserve independently owned grading and explicitly identify which access-denial assertions need a supported native isolation mechanism. Do not silently skip those assertions while claiming equivalent isolation. No model calls or API credentials are required.

### F06 — Extract a small installed kernel

**Work:** Use an isolated branch/package and preserve the current research implementation. Retain installation/projection, native-agent invocation, candidate identity, worktree isolation, check commands and meaningful protection. Remove graph/PageRank/co-edit/automatic map-pack-refresh, historical product-context, duplicate host-evidence storage, and local backlog/overlap machinery from the default installed path. Replace their useful responsibilities with links to existing sources of truth.

**Acceptance:** A clean pilot install works without the removed default modules. No dangling hooks, imports, commands or instructions remain. Relevant regression coverage survives. Historical evidence remains accessible. Existing tracker/Git/CI records supply dependencies and delivery state. Record the installed footprint and startup context; do not delete code merely to hit a number.

### F07 — Keep stage meaning with fewer records

**Work:** Define a compact change record with intent, acceptance IDs, constraints/NFRs, design decisions, short implementation plan, risk and evidence links. Permit separate initiative documents and references. Convert a PRD into vertical slices and dependencies while retaining unresolved human decisions. Select one authoritative home for each record; avoid a second backlog database.

**Start here:** Existing artifact parsing/templates, planning skills, `docs/OPERATING.md`.

**Acceptance:** A new agent can continue one slice using its record and repository state. Approval is attached to the relevant revision. Material intent/design changes invalidate affected approvals. An ordinary implementation discovery does not require duplicating the entire artifact chain. Existing approvals remain valid under an explicit compatibility/migration strategy; no silent policy relaxation.

### F08 — Remove false scope blocks

**Work:** Make predicted file lists advisory for ordinary product work. Retain protection for sensitive operations, trust configuration and independently owned acceptance evidence. Permit legitimate source/test discovery within approved behavior; escalate material changes to behavior, data handling, architecture or release authority.

**Start here:** `.aidlc/lib/guard.mjs`, scope checks, relevant hooks and ownership tests.

**Acceptance:** Reproduce the historical unexpected-file false block, then show a legitimate fix can proceed. Negative tests still reject a consequential unauthorized change, tampered approvals, weakened independent acceptance checks and protected production actions. Routine test maintenance remains possible. Do not achieve this by removing all permission enforcement.

### F09 — Minimize context and repetitive hooks

**Work:** Keep one concise canonical guide projected for Claude Code and Codex. Link to architecture/operations information instead of copying it. Session context should contain the current task, commands and relevant boundaries. Stop runs a fast check only when needed for new changes and avoids recursive/repeated execution. Use additional protection hooks only for a demonstrated gap in native controls.

**Acceptance:** No automatic historical artifact inventory or graph injection. Hook failure produces a short actionable message. A second Stop on the unchanged verified candidate does not repeat expensive work; editing it restores verification. Record startup tokens and hook latency. Both provider projections point to the same project truth.

### F10 — Add the small, resumable dispatcher

**Work:** Implement one supported path first using existing workflow jobs or a small local command. Connect accepted intent → design/plan approval → implementation → checks/review → merge-ready PR. Store only change ID, stage, input revision, attempt, job/session reference, status and evidence links. Schedule ready slices from the selected sprint using existing dependency records.

**Acceptance:** Offline tests prove duplicate events launch one job, one change has one active owner, interrupted work resumes, and stale evidence cannot advance a newer revision. Missing approvals pause with a clear next action. Bounded failure returns to the appropriate stage or escalates. Human acceptance triggers the next step without manual relaunch. Sprint completion requires integrated acceptance, not just individually green slices.

### F11 — Use independent review where it earns its cost

**Work:** Apply the proposal's risk/difficulty triggers. Give the reviewer approved outcomes, exact base/candidate, relevant code and existing check evidence in a fresh read-only context. Return actionable findings and limitations. Keep required human review; a model verdict cannot authenticate a human approval.

**Acceptance:** Seeded correctness/security/performance defects are detected in representative review fixtures. Routine low-risk work does not automatically invoke a frontier reviewer. Review does not repeat already-valid checks or edit the candidate. Repair loops stop after two attempts. Same-model review remains structurally independent.

### F12 — Make production quality executable

**Work:** Wire appropriate project tools for format/lint/types, behavioral and integration tests, architectural dependency rules, secrets/dependency/security checks, and build artifacts. Use independently owned acceptance checks for critical behavior. For brownfield work, block new degradation while exposing the inherited backlog.

**Acceptance:** Each required acceptance criterion has observable evidence for the candidate. Passing, failing, skipped, unavailable and not-run states are distinct. Seeded auth failures, architecture violations, test weakening and new security findings are caught by the relevant project checks. Real product behavior is exercised; source-pattern presence alone is not proof. Checks do not invoke models.

### F13 — Turn performance requirements into tests

**Work:** Record relevant input size, concurrency, latency/throughput, memory and query-count budgets. Use operation counts or query counts for deterministic checks; use representative workloads and calibrated variance for timing benchmarks. Measure scaling at increasing inputs for affected algorithms.

**Acceptance:** At least one seeded quadratic implementation and one N+1 query regression are caught by appropriate tests in a representative fixture/pilot. The corrected implementation passes under the declared workload. Record the environment and measurement limitations. No blanket promise of “no O(n²)” and no always-running performance agent.

### F14 — Connect Deploy to verified releases

**Work:** Extend the dispatcher through the existing pipeline: approved merge → identified build artifact → staging → smoke/journey and migration checks → authorized production promotion → observation. Preserve production authority in the deployment platform. Reuse tested rollback/runbooks, accounting for migrations that cannot safely be reversed.

**Acceptance:** Offline transition tests and a staging demonstration show a failed smoke cannot promote, stale evidence cannot authorize a different artifact, and duplicate events do not repeat deployment. Release records include artifact, environment, checks and observation outcome. Production execution requires the team's actual release authorization; a simulated gate is labeled as simulation.

### F15 — Complete Maintain and the feedback loop

**Work:** Connect an existing alert/incident/scan to bounded agent diagnosis. Attach release identity and relevant logs/metrics/traces, deduplicate findings, and use cooldowns. Diagnosis proposes a reproducible fix and regression test, then returns to the ordinary delivery loop. Automatic recovery is limited to pre-authorized runbooks.

**Acceptance:** A seeded staging incident triggers one diagnosis; repeated alerts do not create a job storm. The finding becomes triaged intent, a tested corrective slice and a verified recovery. Incident closure requires recovery evidence plus regression protection. No continuous model polling or API fallback. Include a bounded maintenance example for dependencies, duplication or architecture drift using the same path.

### F16 — Keep a small, useful evaluation portfolio

**Work:** Separate offline harness mechanics, explicit live product trials and real delivery metrics. Reuse F05's portfolio across greenfield/brownfield, ambiguity, cross-file changes, migration, security, performance and incident recovery. Compare native versus lean using matched model, effort, environment and independent outcome checks. Run only selected live trials relevant to the change before a deliberate broader campaign.

**Acceptance:** Failed, incomplete and unavailable runs remain visible. Success means observed product outcomes. Report accepted outcomes, interventions, false blocks, defects, elapsed time and usage per accepted change. Do not compare retrieval against naive whole-file reads. Preserve raw evidence and distinguish subscription usage estimates from actual financial charges. A small sample cannot justify a confident statistical claim.

### F17 — Team pilot and adoption decision

**Work:** Complete at least 20 representative slices with two engineers and separate worktrees, across the selected pilots. Demonstrate dependency handling, integrated acceptance, interruption recovery, release and maintenance. Review which optional mechanisms improve outcomes enough to keep.

**Acceptance:** Use the proposal's adoption criteria: no false scope blocks in the sample; quality no worse than the native baseline within the evidence's limits; fast/full feedback targets of two/ten minutes for the pilots; declared performance budgets; required review and release authority; and demonstrated Plan-through-Maintain recovery. Explain uncertainty and any unmet target. Publish a short operating guide and an evidence-backed adopt/revise decision. Relax routine pre-code approvals only as a separately recorded policy decision.

## Completion record for each item

Update its status in this document and add a brief note containing: implementation commit/PR, commands executed and results, evidence location, unresolved limitations, and next eligible item. Reuse PR/CI records rather than copying their contents. Mark items blocked only for a concrete missing dependency or user decision; do not treat an unrun live check as a pass.

## Copy-paste handoff prompt

```text
Read docs/LEAN-HARNESS-IMPLEMENTATION-BACKLOG.md and the relevant sections of
docs/LEAN-HARNESS-RESEARCH-PROPOSAL.md. Inspect git status and applicable repository
instructions before editing. Start with F01, reviewing and completing the existing
subscription-only patch rather than recreating it. If F01 is already complete, choose
the first unfinished item whose dependencies are satisfied.

Implement one coherent item, verify it offline, and update its completion record.
Preserve existing user changes, especially CODEBASE-MAP.md. Do not use Anthropic API
credentials, add an API fallback, or run live evaluations as part of normal testing.
Do not require Docker for unit or integration tests; implement F18 before pilot setup.
Live subscription trials must be explicitly requested and bounded. Report missing
sign-in, hosted publication or real-environment verification as pending, not complete.

Keep the full Plan–Design–Build–Test–Deploy–Maintain scope. Preserve meaningful
approvals and evidence while simplifying implementation. Use native tools and one
small dispatcher; avoid speculative frameworks, standing agent teams and duplicated
state. Finish with what changed, verification, remaining limitations and the next item.
```
