# Harness audit against Anthropic's AI-Native SDLC playbook

Date: 2026-09-18  
Source reviewed: [Anthropic, *The AI-Native SDLC playbook* (21 August 2026)](https://claude.com/blog/the-ai-native-sdlc-playbook)

## Executive verdict

The harness is strongest in **Build and Test**, partly implements **Plan, Design, and PR review**, and does not yet implement an end-to-end **Deploy or Maintain** loop. Its artifact chain, digest-bound approvals, deterministic checks, separate evaluator, worktree isolation, and eval suite closely reflect the playbook. Its main divergence is that it has built a substantial internal control and research system before proving that the system improves delivery outcomes.

The harness is **over-engineered as a default product**, although the consumer scaffold is small. The repository contains 675 tracked files and about 124,779 lines; 70 tracked harness-runtime files contain roughly 7,208 lines in the runtime libraries, checks, and hook dispatcher alone. The runtime also exposes graph indexing, packing, ledgers, baselines, coordination, collision detection, delivery orchestration, model evaluation, release authorization, and multiple review modes. Several of these are reasonable research instruments, but they are not all justified as mandatory production-path features.

Most importantly, productivity gain is **not currently demonstrated**. Running `harness metrics --days 365` on this checkout reports every operational metric as unmeasured: only one eligible check invocation, no delivered changes, no plan-to-PR samples, no spec churn sample, no defect sample, and no with/without contribution record. The repository has an evaluation framework and historical experiments, but it does not yet provide sufficient, current, stage-by-stage evidence that the harness makes teams faster or more effective.

Recommended direction: retain the research repository, but ship a thin default profile containing the artifact contract, concise instructions, project-owned checks, one fast Stop hook, candidate-bound CI, and optional independent review. Make orchestration, graph/context tooling, coordination, ledgers, model campaigns, and maintenance automation opt-in modules activated only after measured need.

## Stage-by-stage comparison

| SDLC stage | Playbook expectation | Harness implementation | Alignment | Main gap |
|---|---|---|---|---|
| Plan | Originator and Claude create a versioned `intent.md`; product owner accepts it; measure idea-to-intent time and intent survival | Templates, intake from a file/URL, artifact storage, status, and approval mechanics exist | Partial/strong | No reliable origin timestamp, product-owner queue outcome, rejection outcome, or idea-to-intent metric |
| Design | Accepted intent becomes `spec.md`, with organizational skills applying policy; human resolves concerns; measure intent-to-spec and late spec rework | `spec.md`, numbered behaviours, digest linkage, skills, and spec approval exist | Strong mechanics | Policy-owner concern workflow is weak; intent-to-spec is not measured; only current-body digest mismatch approximates churn |
| Build | Plan mode, committed `plan.md`, plan/diff synchronization, concise `CLAUDE.md`, skills/hooks, safe parallel worktrees | Plan artifact and approval, generated projections, seven skills, hooks, isolated worktrees, scope drift, implementation driver | Strong but heavy | Exact-file/scope authority can impede legitimate adaptation; too many mechanisms are default; plan-to-code and first-pass merge evidence is absent |
| Test | Tight feedback loop, red-first fixes, protected evidence, first-pass CI, continuous evals based on real tasks/incidents | Fast/stop/commit checks, test guards, proof checks, 24-task eval floor, product campaign, regression gate | Strong mechanics; weak proof | Eval record is not fully green/blocking; configured project quality capabilities can be empty; no current first-pass CI or change-failure-rate sample |
| Deploy | Agentic PR review, human branch protection, approval hooks, sandboxed CI/CD, deploy/rollback through existing gates | Independent evaluator, review policy, PR review/comment flows, release authorization, PR-opening delivery driver | Partial | No demonstrated deployment integration, environment promotion, artifact identity, smoke/canary evidence, rollback rehearsal, or production outcome capture |
| Maintain | Deterministic control bands trigger bounded diagnosis; agent creates new `intent.md`; recurring scans; measure breach-to-intent and repeat incidents | A maintenance example and band-to-intent utility exist; incidents can become pending evals | Weak/experimental | No live telemetry adapter, deduplication/cooldown, triage queue, deployed-version correlation, automated loop, or measured breach-to-intent latency |

The playbook says the stages form a loop and that committed artifacts trigger the next stage. The harness currently implements a well-controlled **change-development pipeline**, not the full operational SDLC loop.

## Productivity measurement required at every step

### Measurement principles

1. Measure an accepted outcome, not code volume, files changed, turns, or agent claims.
2. Use one stable `change_id` across intent, spec, plan, candidate commit, PR, deployment, incident, and follow-up intent.
3. Record both elapsed time and **human active minutes**. AI can reduce touch time while increasing queue time, or vice versa.
4. Report quality and cost beside speed. A faster stage with more rework or escaped defects is not a gain.
5. Compare against a baseline or control. A before/after trend alone confounds task mix, model changes, staffing, and repository maturity.
6. Segment by risk tier, task type, repository, and engineer experience; publish medians and p75/p90, not only means.
7. Require at least 20 completed changes per arm for an initial directional result; treat smaller samples as case studies, not productivity claims.

### Stage metrics and instrumentation

| Step | Primary productivity metric | Quality guardrail | Required events/data | Current coverage |
|---|---|---|---|---|
| Idea → intent | Median elapsed hours and human minutes from first recorded idea to accepted intent | Intent survival into design; late intent edits | `idea_opened`, `intent_drafted`, `intent_accepted/rejected`, actor and timestamps | Missing |
| Intent → spec | Median elapsed hours and human minutes | Spec revisions after plan; unresolved policy concerns | `spec_started`, `spec_opened`, `spec_accepted`, concern count/owner, artifact SHA | Missing except digest linkage |
| Spec → approved plan | Median elapsed hours and human minutes | Plan rejection count; plan/diff conformance at merge | `plan_started`, `plan_accepted`, revisions, approver, artifact SHA | Approval exists; duration/revisions missing |
| Plan → candidate | Median elapsed and compute cost to candidate passing local checks | First-pass candidate success; repair cycles; changed-plan rate | implementation start/end, model/version, cost/tokens, candidate SHA, repair reason | Partly designed in delivery phase records; no samples |
| Candidate → verified | First-pass full-CI success and verification duration | Test mutation/coverage, flaky reruns, escaped regression | CI check start/end/result bound to candidate SHA | Check ledger exists; insufficient samples |
| Verified → review complete | Time to first review and review completion; human review minutes | Important findings, false positives, findings fixed without human edits | PR/review timestamps, severity, resolver type, candidate SHA | Review machinery exists; aggregate metrics missing |
| Review → merge/deploy | Merge queue time and deploy lead time | Deployment failure, rollback, change failure rate | merge, build artifact ID, deploy start/end, environment, health result | Missing |
| Production → maintenance intent | Breach-to-diagnosis and breach-to-triaged-intent | Alert precision, repeat incidents, MTTR, fix conversion | breach signature/tier, deployed artifact, diagnosis, triage, intent/PR link | Experimental only |
| End-to-end | Lead time from accepted idea to healthy production; accepted changes per engineer-week | Change failure rate, escaped severity, rollback rate, customer outcome | Join all events by `change_id` and release ID | Missing |

### Gain formulas

For each stage, calculate both:

```text
elapsed_gain = (baseline_median_elapsed - harness_median_elapsed) / baseline_median_elapsed
touch_gain   = (baseline_median_human_minutes - harness_median_human_minutes) / baseline_median_human_minutes
```

For end-to-end productivity:

```text
quality_adjusted_throughput = accepted_production_changes * (1 - change_failure_rate)
cost_per_accepted_change = (human_cost + model_cost + CI_cost) / accepted_production_changes
```

Do not aggregate stage percentages by adding them. Report the end-to-end lead-time change separately, because queues and rework couple the stages.

### Experiment design

Run a prospective 6–8 week trial:

- Randomize eligible changes within each repository and risk band to **native Claude Code + existing CI** or **thin harness profile**.
- Freeze model/version and major prompts during each block; record exceptions.
- Exclude emergency production changes from randomization, but measure them separately.
- Pre-register primary outcomes: quality-adjusted throughput, human active minutes per accepted change, lead time to healthy production, and change failure rate.
- Collect stage events automatically from Git/PR/CI/deployment systems. Use a lightweight engineer timer or brief stage-completion prompt only for active human minutes.
- After the thin profile establishes a baseline, test optional modules independently: evaluator review, graph/pack, autonomous delivery driver, and maintenance trigger. Do not test the whole bundle as one treatment if the goal is to know which step creates value.
- Publish confidence intervals and raw sample counts. A module remains optional unless it improves a primary outcome without materially worsening quality or cost.

## Over-engineering and bulk assessment

### What is appropriately lean

- The installed consumer scaffold is documented as nine files and references a pinned plugin rather than copying the source repository.
- The runtime is dependency-free and delegates product verification to project-owned commands.
- Git-backed artifacts and digest-bound approvals provide a clear audit trail.
- Candidate-bound checks, a read-only evaluator, and human-only merge authority are sound control boundaries.
- Explicit time and cost ceilings on unattended delivery are sensible.

### What is bulky or insufficiently justified

1. **The default CLI surface is too wide.** It includes lifecycle creation, approval, release authorization, review variants, autonomous delivery, ledger/audit, metrics, eval gates, baseline, map, graph, pack, hooks, and status. This increases learning, testing, and failure surface.
2. **The custom graph/context subsystem is a product within the product.** Graph build/refresh/query, PageRank-like ranking, maps, packs, product context, and co-edit signals require strong comparative evidence. Existing repository research says the graph arm cost more without improving accepted changes in its completed pair.
3. **Coordination machinery precedes demonstrated demand.** Agent-collision detection, worktree selection, coordination state, session identity, and reusable team flows are valuable only for teams actually running concurrent agents. They should not burden single-agent adoption.
4. **Governance mechanisms outnumber observed deliveries.** Baselines, budgets, tamper checks, proof checks, scope drift, approval digests, ledgers, and release records can create duplicated work and false constraints. The current metrics report contains no delivered-change sample with which to justify the combined overhead.
5. **The evaluation system is large but not yet authoritative.** The eval documentation records failures/flakiness and says the live gate is non-blocking. That is useful honest research, but it means the machinery cannot yet serve as proof of production benefit.
6. **Repository scale obscures product scale.** The 375 MB working tree includes worktrees and likely generated/dependency material; tracked source is the fairer measure. Even then, 675 tracked files and roughly 125k lines are substantial for a tool marketed as lean. Documentation/history/evals should be packaged separately from the minimal runtime distribution.

### Recommended product cut

Default core:

- one concise provider-neutral project guide;
- one change record, or `intent/spec/plan` only for changes whose risk warrants separation;
- project-owned `check fast` and `check full` commands;
- one fast Stop hook and one candidate-bound CI workflow;
- Git/PR-native human approval and evidence links;
- minimal event schema for stage timestamps, active minutes, candidate/release identity, result, and cost.

Optional modules:

- independent model review for higher-risk changes;
- autonomous delivery driver;
- worktree/team coordination;
- graph/map/pack context engine;
- live model eval campaigns;
- production control-band diagnosis and runbook execution.

Candidates to remove or consolidate from the default path:

- combine graph, map, pack, ranking, product-context, and co-edit functionality behind one experimental context module;
- replace the custom local ledger as the primary record with PR/CI/deploy event ingestion, retaining only a small local cache;
- collapse eight capability verbs and format parsers into a small project command contract unless granular hooks show measured value;
- run full verification once per candidate in CI; avoid nested or duplicate stop/baseline executions;
- make exact file scope advisory, while keeping behavior/acceptance scope authoritative;
- use risk tiers to decide whether separate intent/spec/plan artifacts and independent review are required.

## Priority actions

1. Add a stable event schema and instrument all six stages before adding another control.
2. Run the thin-profile randomized trial and publish the result, including negative results.
3. Implement real Deploy evidence: artifact identity, environment, health check, rollback outcome, and change failure rate.
4. Implement one bounded Maintain pilot: deterministic breach, deduplicated diagnosis, triaged intent, and incident-to-eval link.
5. Split `core`, `review`, `coordination`, `context-graph`, `eval-research`, and `operations` into explicit profiles.
6. Set deletion budgets: an optional module must show a statistically credible improvement in speed, human effort, quality, or cost to become default.

## Bottom line

The harness faithfully operationalizes many of Anthropic's Build/Test governance ideas, but it currently overweights control-plane sophistication and underweights Deploy/Maintain integration and empirical productivity evidence. Calling it a complete AI-native SDLC implementation would be premature. Calling it a strong experimental Build/Test harness with partial lifecycle orchestration is accurate.

The next meaningful milestone is not another feature. It is evidence that a smaller default harness improves quality-adjusted delivery versus native Claude Code, stage by stage and end to end.
