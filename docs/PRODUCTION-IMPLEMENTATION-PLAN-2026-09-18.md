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
- [ ] P2.2 Require behaviour, QA, hardening and applicable architecture sensors.
- [ ] P2.3 Support reviewed waivers with reason, owner and expiry.
- [ ] P2.4 Distinguish missing, errored, skipped and failed commands in admission evidence.
- [ ] P2.5 Publish onboarding, upgrade and rollback instructions.

Exit: misconfiguration fails before rollout; a clean configured project passes; waivers are visible
and expire.

## Phase 3 — Complete productivity instrumentation

- [ ] P3.1 Define one event schema: change, stage/event, time, actor type, candidate/release,
      result, model/version, cost and environment.
- [ ] P3.2 Keep Git as the intent/spec/plan clock.
- [ ] P3.3 Ingest PR/review timestamps, findings and resolver type.
- [ ] P3.4 Ingest CI duration, first pass, reruns and repair causes, bound to candidate SHA.
- [ ] P3.5 Ingest deployment artifact/environment/health/rollback/change-failure data.
- [ ] P3.6 Ingest incident breach/diagnosis/triage/linked intent and recurrence class.
- [ ] P3.7 Capture human active minutes separately from elapsed time.
- [ ] P3.8 Report median/p75/p90, sample counts, quality-adjusted throughput and total cost.
- [ ] P3.9 Export documented JSON/CSV; no dashboard in the core.

Exit: one change traces from accepted intent to healthy deployment or explicit non-deployment;
missing joins remain `unmeasured`.

## Phase 4 — Thin-core controlled pilot

- [ ] P4.1 Pre-register hypotheses, inclusion rules and primary outcomes.
- [ ] P4.2 Randomize at least 20 completed changes per arm, stratified by repo/task/risk/experience.
- [ ] P4.3 Hold model, project tools and CI constant within comparison blocks.
- [ ] P4.4 Compare native Claude Code + CI with the thin default harness only.
- [ ] P4.5 Measure human minutes, lead time, first-pass CI, review effort, change failure,
      quality-adjusted throughput and total cost per accepted change.
- [ ] P4.6 Preserve failed, abandoned, timed-out and budget-exhausted attempts.
- [ ] P4.7 Publish raw counts, confidence intervals and limitations.

Advance only if the harness improves human effort or quality-adjusted throughput without materially
worsening production quality or cost. Otherwise locate the losing stage and remove/revise it.

## Phase 5 — Test optional modules independently

- [ ] P5.1 Evaluator review versus deterministic CI + human review.
- [ ] P5.2 Graph/map/pack versus competent `rg` and bounded reads.
- [ ] P5.3 Autonomous driver versus interactive Claude Code.
- [ ] P5.4 Worktree coordination versus project-native isolation.
- [ ] P5.5 Continuous live evals versus scheduled/manual evals.

Change one module per experiment. Equivalent outcomes favor the simpler configuration.

## Phase 6 — Close Deploy and Maintain

- [ ] P6.1 Integrate one existing deploy pipeline; do not create another deploy engine.
- [ ] P6.2 Record artifact, environment, authorization, health window and rollback outcome.
- [ ] P6.3 Rehearse rollback, including irreversible-migration boundaries.
- [ ] P6.4 Pilot one deterministic band with deduplication and cooldown.
- [ ] P6.5 Run bounded read-only diagnosis and create a triaged intent linked to the release.
- [ ] P6.6 Route fixes through the ordinary lifecycle; convert incidents into regression evals.

Exit: breach-to-intent and recovery are measurable; no alert/model storm; no standing production
credential or merge authority; rollback/escalation proven.

## Phase 7 — Package and roll out

- [ ] P7.1 Publish a semantic plugin version from an immutable commit.
- [ ] P7.2 Separate runtime package from research history, fixtures and evidence.
- [ ] P7.3 Verify clean install, upgrade, downgrade and uninstall.
- [ ] P7.4 Publish supported Claude Code/Node compatibility.
- [ ] P7.5 Roll out cohort-first with admission and rollback criteria.
- [ ] P7.6 Review control telemetry monthly; delete unreliable/redundant controls.

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

Update the delivery register when an item closes. Phase 1 is complete. Immediate next action is
Phase 2 admission enforcement, starting with P2.2 and adding no adapter, telemetry service, skill,
agent or hook.
