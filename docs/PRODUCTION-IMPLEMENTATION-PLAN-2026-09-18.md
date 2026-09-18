# Production implementation plan — minimal Claude Code harness

Status: **active implementation authority**  
Inputs: [Anthropic audit](ANTHROPIC-AI-NATIVE-SDLC-AUDIT-2026-09-18.md), [production contract](PRODUCTION-READINESS.md), repository tests and the current working tree.

## Objective

Make this the main production harness for Claude Code while proving that it improves delivery.
The default runtime must stay small and its quality controls must fire even when someone starts
with an informal “vibe coding” prompt rather than the artifact workflow.

Success means:

1. edits receive automatic cheap QA, Stop receives targeted tests, and CI verifies the candidate once;
2. every default skill, agent, hook and check has a measured purpose;
3. stage time, human effort, cost and production quality beat an equivalent native-Claude baseline.

This is the only forward-looking production plan. Older plans are evidence, not backlogs.

## Anti-loop protocol

Before starting an item:

1. Search the delivery register below by outcome, not just by filename.
2. Search `docs/history/` and superseded plans for the same mechanism or failure class.
3. Inspect current code and tests; repository behavior outranks old prose.
4. Reopen delivered work only with a linked production incident, failed acceptance criterion, or controlled comparison showing a material regression.
5. State what new evidence invalidates the earlier decision.

Never resume an unchecked box from an older plan merely because it is unchecked. Never create a
second owner for something already owned by Git, Claude Code, CI/CD, the tracker, or observability.

States: `DELIVERED`, `RETAIN`, `OPTIONAL`, `REMOVE`, `REOPEN`, `BLOCKED`.

## Delivery register reviewed before planning

| ID | State | Outcome already delivered | Do not repeat |
|---|---|---|---|
| D01 | RETAIN | `intent → spec → plan → diff → review`, digest-bound approvals | No second contract or approval store |
| D02 | RETAIN | Language-neutral project commands and normalized findings | No language-specific harness plugins |
| D03 | RETAIN | Candidate-bound checks and runtime/policy identity | Never grade an ambiguous working tree |
| D04 | RETAIN | Human-only merge/release authority; independent read-only review | No agent self-approval |
| D05 | RETAIN | Fast edit feedback, targeted Stop, full CI authority | No full suite per edit or duplicate commit run |
| D06 | DELIVERED | Four hooks: SessionStart, safety PreToolUse, edit PostToolUse, Stop | Do not restore Read/Grep/Glob interception without evidence |
| D07 | DELIVERED | Graph refresh/map regeneration removed from Stop | Keep optional indexing off the hot path |
| D08 | DELIVERED | Agents reduced to evaluator and verifier | No explorer/coordinator agent without product evidence |
| D09 | DELIVERED | SessionStart reduced to commands, quality and current change | No graph, ledger or history dump per session |
| D10 | RETAIN | Six skills: intent, design, spec, plan, implement, diagnose | No conductor skills; sequencing belongs in code |
| D11 | RETAIN | Secrets, scope, tamper/proof, architecture and test-integrity sensors | A skipped sensor is not green |
| D12 | OPTIONAL | Graph/map/pack commands | No default benefit claim; previous pairs did not prove one |
| D13 | OPTIONAL | Autonomous driver and worktree coordination | Not default before the thin-core pilot |
| D14 | OPTIONAL | Live model eval campaigns | Non-blocking/flaky evals are not certification |
| D15 | DELIVERED | Metrics refuse thin samples | Never publish anecdotal rates |
| D16 | DELIVERED | Git-derived intent→spec and spec→plan metrics | No duplicate manual timestamps |
| D17 | DELIVERED | Anthropic audit and production admission contract | Redo only if source/runtime materially changes |
| D18 | DELIVERED | `doctor --production` rejects missing required profiles and missing full/targeted tests | Do not add a second readiness command |
| D19 | DELIVERED | Production admission fails installed agent-name collisions | Do not allow an advisory collision in production mode |
| D20 | DELIVERED | Fresh Python and TypeScript installs pass production admission and automatically run edit/Stop QA without SDLC artifacts | Keep this as the consumer seam; do not substitute source-repository tests |
| D21 | DELIVERED | Hook latency emits machine-readable Python/TypeScript samples; commit-stage regression proves the full suite runs once | Treat the initial two-language sample as a baseline, not a productivity claim |
| D22 | DELIVERED | Production admission mandates behaviour, hardening and QA; a declared architecture profile is also mandatory | Projects may add profiles but cannot weaken the production floor |
| D23 | DELIVERED | Committed, target-specific production waivers require reason, owner and future expiry; invalid, expired and unused records fail | No waiver service or self-approval mechanism |
| D24 | DELIVERED | Production doctor separates configuration readiness from current-revision evidence and classifies missing/skipped/errored/failed/passed/waived | Never rerun sensors from doctor |
| D25 | DELIVERED | One onboarding, upgrade and rollback runbook covers plugin lifecycle, pinned identity and collision removal | No second installer or state store |
| D26 | DELIVERED | One bounded productivity-event interchange joins PR, CI, review, deploy, incident, effort and cost evidence; metrics export JSON/CSV | No telemetry service or dashboard in the core |

D06–D09 and D16–D19 are committed at `19a4ad7` with verified runtime identity. D20 is covered by
`test/production-install-smoke.test.mjs`; it creates isolated repositories and isolated homes so
an unrelated locally installed Claude plugin cannot contaminate the result.

## Production boundary

```text
SessionStart -> short quality/current-change context
PreToolUse   -> write, destructive-command and release safety
PostToolUse  -> fast changed-file QA after edits
Stop         -> fast QA plus changed tests
CI           -> full candidate-bound checks exactly once
review       -> evaluator/verifier evidence
human        -> merge and production authority
```

Default surfaces: one plugin, six skills, two quality agents, four hooks/one dispatcher, one
registry/CLI shim, templates/review policy, and deterministic sensors. Graph/map/pack, autonomous
delivery, coordination, live campaigns and production adapters are optional and never ambient.

## Phase 1 — Stabilize the minimal runtime

- [x] P1.1 Review the current diff against D01–D17; exclude unrelated user changes.
- [x] P1.2 Update tests that assert retired ambient graph/read behavior; preserve boundary tests.
- [x] P1.3 Regenerate derived hook/settings projections through repository generators.
- [x] P1.4 Commit the runtime change so identity checks have a real candidate.
- [x] P1.5 Refresh the pinned install/runtime record from that clean commit.
- [x] P1.6 Complete offline suite: 636 tests, 634 pass, zero fail, two explicit skips. The
  descendant-process test preflights process-table access before creating its immortal fixture;
  it still runs the complete assertion on hosts that permit `ps` and skips honestly under EPERM.
- [x] P1.7 Candidate-bound `check --stage commit --all` passed for `3d8efea..b5ae6bb`:
  `ok: true`, verified runtime/policy/candidate identity, and passing secrets, test, budget, tamper,
  architecture and baseline controls. Scope emitted the expected advisory because this maintenance
  commit predates an executable change selection; it was not promoted to delivery evidence.
- [x] P1.8 Fresh-install into Python and TypeScript fixtures; prove hooks fire from an informal prompt.

Exit: verified identity, full deterministic suite green, two-language smoke green, hook p50/p95
recorded, and no duplicate full-suite execution.

Phase 1 exit evidence (2026-09-18): PostToolUse samples were 4,038 ms (Python) and 4,058 ms
(TypeScript), p50 4,048 ms and nearest-rank p95 4,058 ms. Stop samples were 4,037 ms and
4,050 ms, p50 4,044 ms and nearest-rank p95 4,050 ms. These are conservative nested-consumer
measurements from `test/production-install-smoke.test.mjs`; the same run emits the raw JSON rows.
`test/unit.test.mjs` proves a candidate commit stage invokes the full test command exactly once.
The direct source-checkout fast stage measured 0.24 s, but it is not substituted for consumer
latency. Phase 1 is complete; performance improvement remains an evidence-led optimization.

## Phase 2 — Enforce project admission

- [x] P2.1 Add `doctor --production` that fails missing required profiles and full/targeted tests.
- [x] P2.2 Require behaviour, QA, hardening and applicable architecture sensors.
- [x] P2.3 Support reviewed waivers with reason, owner and expiry.
- [x] P2.4 Distinguish missing, errored, skipped and failed commands in admission evidence.
- [x] P2.5 Publish onboarding, upgrade and rollback instructions.

Exit: misconfiguration fails before rollout; a clean configured project passes; waivers are visible
and expire.

## Phase 3 — Complete productivity instrumentation

- [x] P3.1 Define one event schema: change, stage/event, time, actor type, candidate/release,
      result, model/version, cost and environment.
- [x] P3.2 Keep Git as the intent/spec/plan clock.
- [x] P3.3 Ingest PR/review timestamps, findings and resolver type.
- [x] P3.4 Ingest CI duration, first pass, reruns and repair causes, bound to candidate SHA.
- [x] P3.5 Ingest deployment artifact/environment/health/rollback/change-failure data.
- [x] P3.6 Ingest incident breach/diagnosis/triage/linked intent and recurrence class.
- [x] P3.7 Capture human active minutes separately from elapsed time.
- [x] P3.8 Report median/p75/p90, sample counts, quality-adjusted throughput and total cost.
- [x] P3.9 Export documented JSON/CSV; no dashboard in the core.

Exit: one change traces from accepted intent to healthy deployment or explicit non-deployment;
missing joins remain `unmeasured`.

## Phase 4 — Thin-core controlled pilot

- [x] P4.1 Pre-register hypotheses, inclusion rules and primary outcomes. The executable protocol,
      registration schema and fixed decision rule are in `docs/CONTROLLED-PILOT.md` and
      `evals/lib/pilot.mjs`.
- [ ] P4.2 Randomize at least 20 completed changes per arm, stratified by repo/task/risk/experience.
- [ ] P4.3 Hold model, project tools and CI constant within comparison blocks.
- [ ] P4.4 Compare native Claude Code + CI with the thin default harness only.
- [ ] P4.5 Measure human minutes, lead time, first-pass CI, review effort, change failure,
      quality-adjusted throughput and total cost per accepted change.
- [ ] P4.6 Preserve failed, abandoned, timed-out and budget-exhausted attempts.
- [ ] P4.7 Publish raw counts, confidence intervals and limitations.

Protocol implementation note (2026-09-18): `node evals/pilot.mjs assign` performs reproducible
repository/task/risk/experience-stratified assignment, and `node evals/pilot.mjs analyze` joins the
existing productivity events, preserves every unsuccessful assignment, checks frozen model/CI
blocks, and publishes raw counts, 95% intervals and limitations. P4.2–P4.7 remain incomplete until
at least 20 real terminal changes per arm have been collected. Synthetic tests verify the
calculation and refusal paths; they are not product evidence and cannot prove gains.

Advance only if the harness improves human effort or quality-adjusted throughput without materially
worsening production quality or cost. Otherwise locate the losing stage and remove/revise it.

## Phase 5 — Test optional modules independently

- [x] P5.1 Evaluator review versus deterministic CI + human review — seeded live mechanism passed;
      incremental benefit remains unmeasured, so evaluator review stays optional.
- [x] P5.2 Graph/map/pack versus competent `rg` and bounded reads — 33 accepted changes in each
      completed arm, with higher graph cost; graph remains optional.
- [x] P5.3 Autonomous driver versus interactive Claude Code — bounded calibration delivered zero
      accepted changes in both arms and incomplete comparative cost; driver remains optional.
- [x] P5.4 Worktree coordination versus project-native isolation — real-worktree integration is
      correct, but has no paired benefit evidence; native Git isolation remains the default.
- [x] P5.5 Continuous live evals versus scheduled/manual evals — continuous execution has no
      benefit evidence and adds standing cost/credential surface; retain bounded scheduled/manual evals.

Change one module per experiment. Equivalent outcomes favor the simpler configuration.

The evidence, limitations and decisions are recorded independently in
`docs/OPTIONAL-MODULE-EVIDENCE.md` and machine-checked against retained sources by
`test/optional-modules.test.mjs`. Phase 5 is complete as a module-disposition exercise: no bulky
module earned promotion into the thin default.

## Phase 6 — Close Deploy and Maintain

- [x] P6.1 Integrate one existing deploy pipeline; the read-only evidence adapter consumes its
      events and performs no build, promotion or rollback action.
- [x] P6.2 Record artifact, environment, candidate-bound authorization, health window and rollback outcome.
- [x] P6.3 Rehearse successful reversible rollback and irreversible-migration escalation.
- [x] P6.4 Pilot one deterministic release/metric/tier band with deduplication and cooldown.
- [x] P6.5 Run bounded read-only diagnosis and create a triaged intent linked to the release.
- [x] P6.6 Route fixes through the ordinary approved lifecycle and seed a regression eval from the incident.

Exit: breach-to-intent and recovery are measurable; no alert/model storm; no standing production
credential or merge authority; rollback/escalation proven.

Phase 6 evidence is documented in `docs/DEPLOY-MAINTAIN-EVIDENCE.md` and exercised by
`test/deploy-maintain.test.mjs`, `test/maintain-edge.test.mjs`, and `test/release-record.test.mjs`.
The environment is disposable local staging; no real production deployment is claimed.

## Phase 7 — Package and roll out

- [x] P7.1 Publish semantic plugin version 0.2.0 from immutable source commit `d9526a3`, tagged
      and pushed as `v0.2.0`.
- [x] P7.2 Separate the runtime package from research history, fixtures and evidence.
- [x] P7.3 Verify clean install, upgrade, downgrade and uninstall against immutable package commits.
- [x] P7.4 Publish supported Claude Code/Node compatibility in `docs/COMPATIBILITY.md`.
- [x] P7.5 Open the maintainer cohort for `0.2.0`, capped at two projects, with admission, halt,
      rollback, and minimum healthy-period criteria in `release/rollout.json`. Enrollment begins at
      zero; opening the cohort does not claim an unobserved deployment.
- [x] P7.6 Record the initial control-telemetry review and monthly retain/revise/delete cadence.

Packaging and rollout evidence lives in `release/package.mjs`, `release/rollout.json`,
`release/telemetry-review.json`, `docs/COMPATIBILITY.md`, and `test/release-package.test.mjs`.
The runtime package is its own minimal Git repository so exact consumer pins remain verifiable.
The immutable runtime release is published at `v0.2.0`; the maintainer cohort is open and records
zero initial enrollments so rollout evidence cannot be confused with unobserved adoption.

## Scorecard

| Transition | Productivity | Quality guardrail |
|---|---|---|
| idea→intent | elapsed + active minutes | survival rate |
| intent→spec | elapsed + active minutes | late requirement churn |
| spec→plan | elapsed + active minutes | rejected/revised plans |
| plan→candidate | time + model cost | first-pass success, repairs |
| candidate→verified | CI time + first-pass rate | flakes, weakened tests |
| verified→reviewed | review time + human minutes | important findings, false positives |
| reviewed→deployed | queue/deploy lead time | failures, rollback, health |
| breach→intent/fix | diagnosis/recovery time | precision, recurrence |
| end to end | quality-adjusted throughput + cost/change | change failure, escaped severity |

Lines, files, turns, nominal completions and model self-reports are never primary productivity outcomes.

## Completion record template

```text
Item and candidate commit:
What changed:
Deterministic checks:
Product/runtime exercise:
Samples and outcomes:
Known gaps:
Decision: retain | revise | remove | blocked
Evidence:
```

Update the delivery register when an item closes. Phases 1–3 are complete. Immediate next action is
Phase 4's pre-registered thin-core controlled pilot; instrumentation alone is not evidence of a
productivity gain.
