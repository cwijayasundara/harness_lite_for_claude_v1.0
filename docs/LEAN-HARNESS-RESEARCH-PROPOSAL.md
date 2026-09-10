# A Lean Harness for Production Software Development

Revision: 10 September 2026. Reviewed against the user's full Plan–Design–Build–Test–Deploy–Maintain scope and Claude Code subscription/billing requirements. Lifecycle redesign remains a proposal. Following the user's instruction to stop API use, local subscription-only runners and manual-only CI configuration have been implemented; hosted workflows are unchanged until those changes are published.

Additional user constraint: unit and integration tests must not depend on Docker. The existing Docker-backed tests need migration to native fixtures/processes; skipping them without Docker does not satisfy this requirement. See [implementation backlog F18](LEAN-HARNESS-IMPLEMENTATION-BACKLOG.md#f18--remove-docker-from-the-unitintegration-test-path).

## Executive conclusion

The harness should automate the complete lifecycle through Maintain, using a thin, provider-portable control layer around Claude Code, Codex, Git, CI/CD, and monitoring. It needs to supply:

1. a small, current statement of intent and risk;
2. a reproducible environment with one obvious way to run and verify the product;
3. fast deterministic feedback while editing and authoritative evidence in CI;
4. an independent review path only when the risk or task difficulty justifies its cost.
5. reliable handoffs from accepted intent through deployment, with production findings returning to the same delivery loop.

The current system is technically careful, extensively tested, and unusually honest about its limitations. Its shipped kernel is about 6,700 lines, the deterministic test suite has 432 cases, and 291 of 532 tracked files are historical change artifacts. Those counts are maintenance indicators, not proof of overengineering. The stronger reasons to simplify are observed false blocks, duplicated checks, and experimental overhead without a demonstrated outcome improvement. Preserve useful lifecycle responsibilities and traceability while reducing the machinery that implements them.

The recommended next version, called **Lean v3** in this report, has one governing principle:

> Let the coding agent make engineering decisions inside a small, explicit risk boundary. Make only correctness, security, scope protection, and release authority deterministic.

For the first rollout, retain the existing intent/spec/plan approval policy while making handoffs automatic after approval. Combining approvals for routine work is a later, measured policy change. The pull request is a merge gate; release verification and maintenance close the lifecycle. Existing tools should own their records, with a small dispatcher connecting them.

The right automation unit is not a sprint. A sprint is a human prioritization and capacity boundary. The agent automation unit is a **small independently verifiable change**, normally one ticket, one worktree, and one pull request. A sprint is then a selected set of those changes, with dependency order owned by the issue tracker or a very small external driver.

## What the evidence says

### External evidence

The strongest current reports converge on a few principles.

First, high-performing agentic engineering systems make the repository and runtime legible. OpenAI reports that its agent-first product effort used repository-local knowledge, isolated worktree instances, executable tests, browser access, logs, metrics, traces, and mechanically enforced architectural boundaries. Its short root instruction file served as a table of contents rather than an encyclopedia.^1 This supports keeping a concise project map and improving executable product feedback. It does not support building a second local database of everything already represented in Git and the repository.

Second, decomposition and persistent artifacts help long-running work, but the artifacts should carry only the state needed by the next session. Anthropic found that a feature list, Git history, an executable startup script, incremental progress, and end-to-end verification were sufficient to address common long-horizon failures.^2 Its later planner/generator/evaluator work found that a planner still added value, while sprint decomposition and routine evaluator passes became unnecessary overhead as the underlying model improved. The evaluator remained useful for tasks at the edge of the generator's reliable ability.^3 This argues for a planner at the product boundary and risk-triggered review, not a mandatory multi-agent ceremony for every change.

Third, complexity is not automatically capability. Agentless achieved competitive repository-level repair using localization, repair, and validation rather than an autonomous tool-and-planning framework.^4 SWE-agent separately showed that a well-designed agent-computer interface materially changes performance.^5 Together, those results suggest that simple, reliable tools and feedback are more valuable than a large policy state machine.

Fourth, outcome evaluation matters more than confident transcripts. Anthropic distinguishes the agent's claim from the final environment state, recommends multiple trials because model behavior varies, and describes agent evaluation as evaluation of the model and harness together.^6 Infrastructure must also be controlled: Anthropic measured a six-point Terminal-Bench swing from resource configuration alone and recommends treating resource floors, limits, timeouts, and environment identity as first-class experimental variables.^7

Fifth, apparent productivity is not sufficient evidence. METR's randomized trial found experienced maintainers using early-2025 tools took 19% longer despite believing they were faster.^8 DORA's 2025 research found positive relationships with throughput and product performance but continued negative relationships with delivery stability; strong automated testing, version control, fast feedback, platform quality, and user-centricity determined whether AI amplified a healthy or unhealthy system.^9 The harness therefore needs to optimize accepted product outcomes and stability, not files, lines, turns, or nominally completed tasks.

Finally, autonomous coding expands the security boundary. OWASP identifies repository instructions, issue and review text, MCP tools, broad credentials, mutable tests, and chained agents as specific attack surfaces.^10 NIST's SSDF remains the appropriate process-level baseline for integrating security practices into the SDLC.^11 Sandboxing, least privilege, protected release authority, dependency analysis, and independent security verification belong in the delivery system even if they are not custom harness code.

### Evidence in this repository

The repository has several real strengths worth preserving:

- `CLAUDE.md` is short and primarily navigational.
- The check runner uses project-owned commands and fails honestly when a tool is absent.
- Candidate checks bind a base and candidate revision rather than grading an ambiguous working tree.
- The plugin/runtime identity is pinned and inspected.
- Worktrees isolate concurrent implementation.
- Product campaigns use private outcome assertions and preserve incomplete or failed evidence.
- The evaluator is structurally separate and read-only.
- The code is heavily regression-tested: on 10 September 2026, 420 tests passed, 12 environment-dependent tests were skipped, and none failed in 68.3 seconds.

The same evidence also shows that the harness has crossed its useful complexity boundary:

| Observation | Repository evidence | Consequence |
|---|---|---|
| Historical protocol dominates the tree | 291 of 532 tracked files are under `.aidlc/artifacts`; 64 artifact directories exist | Navigation, status, maintenance, and review carry history that does not help the current change |
| Broad agent behavior is not reliably green | The recorded 6 September broad run reports 12 pass, 9 fail, and 2 flaky; the following campaign failed after spending about $1.61 | Deterministic unit coverage of the harness is not evidence that the harness improves coding-agent outcomes |
| Exact authority can trap the agent | The later ledger campaign consumed 44,513 output tokens and 86 turns before proposing fresh changes or bypasses after write refusal | A guard intended to preserve scope can create the very workaround behavior it is meant to prevent |
| Native Claude was cheaper in the completed paired comparison | Both native and harness arms delivered 33 accepted changes in six completed trials; cost per accepted change was about $0.185 native and $0.238 harness | The harness showed a possible reliability benefit—one avoided verification failure—but no demonstrated throughput or cost benefit |
| The custom graph is not yet load-bearing | The completed graph pair delivered 33 accepted changes in both arms; the graph arm cost about $0.257 per accepted change versus $0.240 without it | Graph, PageRank, co-edit history, map, pack, refresh, and product-context code should not ship by default |
| The graph's local benchmark has the wrong comparator | The current pack benchmark reports 4,102 pack tokens; its bounded `rg` figures total roughly half that, while both locate all ten answers | Comparing a pack with naive whole-file reads exaggerates value when competent agents use bounded search |
| Commit validation duplicates expensive work | `baseline.capture()` calls the complete `stop` stage; `commit` already includes `stop` before `baseline` | A commit check executes the main test suite twice and emits no progress during the nested run |
| Backlog coordination is noisy | Status reports overlaps between the selected change and many old approved changes whose intents remain open | A useful current-work signal is buried under lifecycle bookkeeping |
| Production quality coverage is incomplete | The self-repository config leaves format, lint, typecheck, coverage, dependency checks, and project performance empty; test quality is explicitly only a presence heuristic | The harness has strong meta-governance but no general evidence that generated product code is secure, performant, or maintainable |

These findings do not mean the research was wasted. They identify which ideas survived contact with evidence. The next version should be created by subtraction, with the current repository retained as the experimental reference.

## Lean v3 design

### The minimum architecture

```text
PRD / issue tracker
       |
       v
product planner ──> approved outcome slices and risk labels
       |
       v
one slice ──> one isolated worktree ──> native coding agent
                                      |  explore / implement / test
                                      v
                               project check commands
                                      |
                                      v
                                  pull request
                              /         |          \
                       CI evidence  risk review  human decision
                              \         |          /
                                      merge
                                        |
                                  deploy pipeline
                                        |
                               telemetry / incidents
                                        |
                                  new issue or PRD
```

The harness connects every stage, while the tracker owns backlog and dependencies, Git owns history, CI owns merge evidence, the deployment platform owns releases, and observability owns runtime truth. A small event dispatcher invokes the appropriate native agent or existing pipeline and records the resulting evidence link.

### Four shipped surfaces

Lean v3 should ship four project-facing surfaces and one small workflow dispatcher described below. Hook and file-count targets are design budgets, not hard limits that override required behavior.

#### 1. A concise project guide

Keep one provider-neutral source projected into `CLAUDE.md` and `AGENTS.md`. Limit it to roughly 60–100 lines and make it a map:

- the product's purpose and non-negotiable boundaries;
- `./dev/bootstrap`, `./dev/run`, `./dev/check fast`, and `./dev/check full`;
- where architecture, security, product, and operations truth lives;
- the rule that a change must be verified before it is called complete;
- protected operations that require a human.

Do not inject artifact inventories, superseded behaviors, graph hubs, budgets, ledger statistics, or historical coordination into every session. The current ticket, current worktree, Git diff, and current failures are the relevant state.

#### 2. One optional change contract

Preserve the meanings of intent, design, implementation plan, and review evidence. For small changes, intent/design/plan can be distinct sections of one change record. For initiatives, keep separate product and design documents and reference them from each slice. Existing artifacts remain valid; consolidation is optional and should not erase approval history. A compact record can start with this shape:

```markdown
# CHG-142: Prevent duplicate settlement

Outcome: Retried settlement requests create one settlement.
Risk: high — money movement and idempotency

Acceptance:
- AC1: same idempotency key and payload returns the original result
- AC2: same key with a different payload is rejected
- AC3: behavior remains correct with two concurrent requests

Constraints:
- no externally visible API break
- existing settlements remain readable

Proof:
- integration test for AC1/AC2
- concurrency test for AC3
- query count and p95 do not regress at the declared load

Decision needed: storage uniqueness strategy
```

Before implementation, record the design decision and a short plan in this record or a linked artifact; trivial work may need only a sentence. Record acceptance against the relevant revision. Exact file lists are advisory predictions, not execution authority. Protect consequential operations and independently owned acceptance evidence, while allowing legitimate test maintenance under review.

Traceability is simple: ticket ID in the branch and PR, acceptance IDs in test names or test metadata, and CI results attached to the candidate commit. Do not maintain a parallel semantic history graph. Git, the ticket, tests, and the PR already form the evidence chain.

#### 3. Project-owned executable commands

Reduce eight capability verbs and format adapters to four stable project commands:

```text
./dev/bootstrap       reproducible toolchain and dependencies
./dev/run             local runnable product or service
./dev/check fast      formatter/lint/types/targeted tests; target under 2 minutes
./dev/check full      full tests/security/build/integration; target under 10 minutes
```

The harness does not parse pytest, ESLint, Ruff, Maven, Gradle, Go, Rust, or framework-specific outputs. Each project command returns an exit code and writes one small JUnit/SARIF/JSON summary if detailed evidence is needed. Existing ecosystem tools remain the implementation.

Bootstrap and unit/integration checks must work without Docker installed. Use temporary data directories, native processes and ephemeral ports for local services, with cleanup on success, failure and timeout. Exercise real database semantics where required through a supported native test dependency. Worktrees and separate processes provide working-state separation, not an OS security boundary; tests must accurately describe what isolation they verify. Product deployment can choose containers independently of this testing contract.

This is the most important greenfield scaffold requirement and the first brownfield integration task. An agent that cannot start, observe, and test the product has no credible path to production quality.

#### 4. Two deterministic hooks and one CI authority

Use hooks only where determinism matters. Claude's documentation describes command hooks as deterministic lifecycle controls and recommends them for repetitive enforcement.^12 Lean v3 needs at most:

- `SessionStart`: inject fewer than about 150 tokens—the current ticket, the four commands, and protected-operation reminder.
- `Stop`: when code changed, run `./dev/check fast` once and return a concise actionable failure.

A `PreToolUse` hook may protect a very small denylist if the provider's native sandbox and permission rules cannot express it. It must not block ordinary product edits based on predicted file ownership. Release, credential, and production-data authority should be denied by the execution environment, not merely by prompt text.

CI runs `./dev/check full` exactly once against the candidate commit and is authoritative. Expensive checks are not recursively invoked by a token-baseline check. No local approval digest is treated as human authentication.

## The delivery flow

### Alignment with the AI-Native SDLC playbook

The user's source playbook connects Plan, Design, Build, Test, Deploy, and Maintain through committed artifacts and automated handoffs. It calls for accepted plans before implementation, human accountability, and maintenance findings returning to planning. [15](https://claude.com/blog/the-ai-native-sdlc-playbook)

The first draft under-specified the handoffs and proposed relaxing approval policy too early. This revision preserves those responsibilities. Combining documents, using risk-based approvals, and invoking reviewers selectively are proposed adaptations for this small team, not claims that the playbook prescribes them.

### Stage contracts and automatic handoffs

| Stage | Trigger and agent work | Completion evidence and next action |
|---|---|---|
| Plan | Human PRD, accepted issue, or triaged maintenance finding; clarify outcomes, constraints, acceptance criteria, dependencies, and sprint slices | Product owner accepts a versioned intent; dispatcher starts Design |
| Design | Accepted intent; inspect existing architecture, choose approach, record alternatives and security/performance/data implications, prepare implementation plan | Required design/plan approval bound to the revision; dispatcher selects the next ready slice |
| Build | Accepted plan and satisfied dependencies; agent implements in an isolated worktree | Candidate revision, changed behavior, focused tests and short handoff; invoke Test |
| Test | Candidate change; project checks, real user/API journey and independent review where required | Evidence for the same candidate revision; failures return to Build within the retry budget; passing evidence opens the merge gate |
| Deploy | Approved merge; existing pipeline builds an identified artifact and deploys to staging | Smoke/journey checks and migration compatibility; authorized production promotion, health observation and release record |
| Maintain | Existing alert, incident ticket, dependency scan or scheduled bounded maintenance job | Agent diagnosis linked to release and telemetry; triaged finding becomes new intent, or an approved runbook executes and records recovery |

Maintain requires more than creating an incident ticket. The agent correlates the alert with recent changes, gathers bounded logs/traces, proposes a reproduction and fix, and prepares a regression test. The fix traverses the same design/build/test/deploy path. Close the incident only after recovery evidence and the regression check exist. Alerting remains deterministic; use an agent when there is a finding to investigate, rather than keeping a model continuously polling.

### The smallest reliable dispatcher

Use the existing CI workflow or a small local command as the dispatcher. Start with one supported execution environment. Store one run record per change in the selected tracker or workflow store: change ID, stage, input revision, attempt, job/session reference, evidence links and status. Reuse the platform's job locks and retries rather than adding a database or a fleet of coordinator agents.

Required behavior:

- Identify an invocation by change ID, stage and input revision; repeated events must not start duplicate work.
- Claim one active run per change. On restart, inspect the existing job, worktree and evidence before retrying; do not repeat a merge, deployment or migration blindly.
- Reuse evidence only for the candidate and relevant environment it verified. New commits invalidate affected approvals/checks.
- Persist a short handoff and pause on missing approval, ambiguous requirements, authentication failure or quota exhaustion. Never silently switch to API billing.
- Bound each invocation by time and turns, each repair loop by two attempts, and each campaign by an explicit operator-selected limit. Infrastructure retries and model repairs must be counted separately.
- After approved merge, dispatch the next ready slice in the selected sprint. Release the integrated sprint increment according to the team's policy; demonstrate integrated acceptance before calling the sprint delivered.
- Deduplicate alerts by service, incident signature and active incident; apply cooldowns and a diagnosis budget to prevent an alert storm from becoming a model-call storm.

Production promotion stays in the existing protected deployment workflow. Automatic rollback is allowed only through an already-authorized, tested runbook, and must account for irreversible migrations; otherwise escalate. Record artifact identity, environment, health evidence and recovery outcome. This is orchestration through Maintain without implementing another deployment engine.

### PRD to an executable backlog

The product-planning pass should turn a human or semi-autonomous PRD into:

- intended user and business outcomes;
- explicit non-goals;
- functional acceptance criteria with stable IDs;
- non-functional budgets for security, performance, availability, privacy, and cost where relevant;
- vertical change slices, each independently demonstrable;
- dependencies and risk labels;
- unresolved product decisions for a human.

It should avoid detailed implementation instructions unless the PRD genuinely constrains them. Anthropic's planner experience found that premature low-level technical decisions can cascade errors downstream, while outcome-level planning remained useful.^3

Store the approved product brief in the repository when it must outlive an external tool. Store the executable backlog in the team's issue tracker. For a fully autonomous greenfield experiment, a small `features.json` with acceptance steps and pass state is a reasonable substitute, following Anthropic's long-running harness findings.^2 Do not duplicate the same requirements across four Markdown artifacts per change.

### Slice sizing

A suitable slice:

- produces one observable user or operator outcome;
- normally changes one cohesive area;
- can be tested and reviewed independently;
- has a rollback or compatibility story when state or APIs change;
- is likely to fit in one focused agent context.

If a slice cannot be described with roughly three to eight acceptance criteria, it is probably too broad or is an initiative rather than an execution unit. This is a diagnostic guideline, not a parser rule.

### Risk-adaptive gates

| Tier | Typical work | Before code | Before merge | Release |
|---|---|---|---|---|
| R0 | docs, mechanical refactor, generated files | none | deterministic checks | normal pipeline |
| R1 | routine feature or bug with local blast radius | approved ticket | CI; human or policy-based merge | normal pipeline |
| R2 | public API, schema, migration, cross-service change, meaningful performance work | one human design decision | CI plus independent agent review and human merge | staged/canary if applicable |
| R3 | auth, money, privacy, destructive data operation, production credentials or access | explicit human design and threat review | security-owner review plus CI | explicit human release authority |

This table is a proposed later operating policy. Initially retain current pre-code approvals and automate the transitions after them. Relax routine gates only after pilot evidence and an explicit team policy decision; risk classification alone is not proof that a gate is unnecessary.

### Implementation loop

For each slice, the native agent should:

1. inspect the ticket, relevant guide, existing code, tests, and recent Git history;
2. reproduce current behavior or create a failing acceptance test when practical;
3. record a proportionate plan and confirm the required acceptance is present;
4. implement the smallest coherent change;
5. run targeted checks, then `./dev/check fast`;
6. exercise the real product surface—API, browser, CLI, job, migration, or event flow;
7. inspect the final diff for unrelated change, duplication, dead code, test weakening, and operational gaps;
8. open or update the PR with acceptance evidence and remaining uncertainty.

Fresh context should normally begin at a new slice. A compact handoff should contain the ticket, candidate commit, commands run, failing evidence, and next action—not a transcript summary.

### Review loop

Do not run a frontier evaluator on every change. Anthropic's later harness work found evaluation useful at the boundary of the generator's capability and overhead within the model's reliable range.^3 Invoke an independent reviewer for R2/R3 work, large or cross-cutting diffs, unfamiliar subsystems, persistent failed attempts, or an explicit human request.

The reviewer receives the approved outcome, base/candidate diff, relevant source, and test evidence in a fresh read-only context. It evaluates:

- acceptance criteria and regressions;
- correctness and failure modes;
- security and privacy boundaries;
- data compatibility and rollback;
- performance on declared hot paths;
- maintainability and architectural fit;
- test quality, including weakened or circular tests.

It does not re-run deterministic checks if CI already supplies them. It should return only actionable findings with file/line evidence and confidence. Cap automated repair at two attempts before escalating; repeated disagreement is evidence of unclear requirements, a weak evaluator, or a design decision—not an invitation to loop forever.

### Parallelism

One agent owns one slice and one worktree. Parallelize only independent slices with stable interfaces. Claude's agent-team documentation warns that teams add coordination overhead and significant token cost and are a poor fit for sequential tasks, same-file edits, and dependency-heavy work.^13 The C-compiler experiment demonstrates the possible scale of agent teams, but it also used almost 2,000 sessions and about $20,000, and its author warns that passing tests is not sufficient assurance.^14

For a small engineering team, the normal topology is:

- one planner for an initiative;
- one implementer per independent slice;
- zero or one independent reviewer per slice;
- one human accountable for product decisions and merge/release authority.

Do not create standing architect, test, security, performance, documentation, and coordinator agents. Express those concerns as project tools, acceptance criteria, and risk-triggered review lenses.

## Production-quality controls

### Correctness

Every acceptance criterion must have observable proof. Prefer black-box or contract tests at the boundary users depend on. Preserve existing regression tests. For critical behavior, acceptance tests should be authored or reviewed independently from the implementation context; a suite generated and freely modified by the same agent is weak evidence. OWASP specifically calls out deleted tests, weakened assertions, and mocks that replace the unit under test as agentic coding risks.^10

The CI summary should distinguish:

- executed and passed;
- executed and failed;
- skipped;
- not executed;
- unavailable because the environment was incomplete.

Only the first is positive evidence.

### Maintainability and architecture

Agents imitate local patterns, including poor ones. Establish a small set of mechanical architectural invariants early for greenfield projects and characterize existing boundaries before enforcing them in brownfield projects. Useful invariants include allowed dependency directions, boundary validation, module ownership, migration rules, and size/complexity ceilings. OpenAI reports that mechanically enforced layers and “taste invariants” were central to keeping high-throughput agent-generated code coherent.^1

Prefer standard linters and architectural-test libraries over a harness-specific source parser. Give failures remediation-oriented messages. Run a scheduled, small “garbage collection” task that opens focused cleanup PRs for repeated duplication, dead code, stale docs, and boundary erosion. Do not block product delivery on a large speculative quality framework.

### Security and supply chain

The current built-in secret scan is necessary but insufficient. Project CI should select controls from the product's threat model and applicable SSDF/ASVS requirements:

- dependency lock and vulnerability policy;
- SAST and secret scanning;
- license and provenance policy where required;
- SBOM and signed build provenance for released artifacts;
- authentication/authorization negative tests;
- migration and rollback checks;
- least-privilege agent credentials and network access;
- sandboxed execution for untrusted repository, issue, review, or MCP content.

Keep these as project pipeline capabilities, not bespoke zero-dependency reimplementations in the harness. The harness merely makes the commands discoverable and ensures their evidence is attached to the candidate.

### Performance and algorithmic complexity

“No O(n²)” cannot be guaranteed by a global prompt or generic static check. Quadratic work can be harmless at a bounded cardinality of ten and catastrophic at a million; database round trips and serialization often dominate the loop visible in source. Production performance requires a declared workload and executable budgets.

For each performance-sensitive acceptance criterion, record:

- maximum or expected input cardinality;
- latency/throughput and memory budget;
- concurrency level;
- database/query-count budget;
- representative fixture or workload;
- measurement environment and variance allowance.

Use a layered proof strategy:

| Risk | Proof |
|---|---|
| Algorithm over growing input | operation-count test where possible; otherwise benchmark at 1x/2x/4x and inspect growth slope |
| Database-backed endpoint | query-count/N+1 test plus representative `EXPLAIN` plan and indexes |
| Hot API or job | repeatable benchmark with p50/p95, throughput, CPU and memory comparison |
| Concurrent code | race detector, stress/property tests, idempotency and contention tests |
| Release-critical path | load test in a controlled environment and canary SLO observation |

Performance checks should be risk-triggered. Fast deterministic operation-count or query-count tests can run on every relevant PR. Noisy wall-clock benchmarks run on stable runners, compare distributions rather than a single time, and fail only outside an empirically calibrated band. Anthropic's infrastructure study shows why hardware, memory headroom, concurrency, and timeouts must be recorded with performance evidence.^7

An agent should be prompted to inspect complexity only on declared hot paths and when it introduces loops, queries, large collections, recursion, caching, or concurrency. The reviewer then checks the claimed complexity against code and measurement. Do not add a universal “performance agent” or pretend a regex over nested loops is a correctness proof.

### Operations and delivery

The harness should drive the change through the existing delivery pipeline and its post-release maintenance loop. A production repository must expose enough runtime state for an agent to:

- start an isolated instance;
- exercise critical journeys;
- query relevant logs, traces, metrics, and health;
- observe a canary or staging deployment;
- open an incident ticket from an SLO or error-budget breach.

The deployment pipeline owns environment promotion and rollback. R3 release authority is held outside the coding agent's credentials. Production failure becomes a new issue with linked telemetry and reproduction evidence.

## Greenfield and brownfield profiles

### Greenfield bootstrap

Before feature throughput, land one thin vertical slice and the paved road:

1. repository structure and mechanically enforced dependency directions;
2. reproducible bootstrap and local run commands;
3. formatter, linter, type checker, unit and integration test commands;
4. one real end-to-end journey;
5. structured logs, health, basic traces/metrics, and error handling;
6. CI, dependency/security scanning, artifact build, and deployment skeleton;
7. product brief, feature backlog, and initial performance/SLO budgets.

The first slice should prove that code can travel from requirement to running environment with evidence. Do not generate a large horizontal architecture full of placeholders before this path works.

### Brownfield bootstrap

Do not demand that an existing repository conform to the whole ideal before the first useful change. Start with:

1. `./dev/bootstrap`, `./dev/run`, and check wrappers over existing tools;
2. characterization tests around the target behavior;
3. a baseline of current CI, flaky tests, dependency/security findings, and relevant performance;
4. a short architecture map linking to existing sources of truth;
5. one small real defect or feature carried end to end;
6. ratchets that block only new degradation, not the inherited backlog.

Brownfield enforcement should be incremental: “do not make the touched area worse” before “make the entire repository clean.” Exact file-scope guards are especially risky here because discovery often changes the legitimate blast radius.

## What to keep, simplify, remove, and add

| Decision | Current mechanism | Lean v3 treatment |
|---|---|---|
| Keep | concise canonical instructions and provider projections | Keep, shorter and purely navigational |
| Keep | project-owned commands and honest skipped/errored states | Keep concept; collapse to bootstrap/run/fast/full |
| Keep | candidate base/head identity, worktree isolation, pinned runtime | Keep, preferably using native Git/CI primitives |
| Keep | isolated product campaigns and outcome assertions | Keep as development eval infrastructure, not shipped runtime |
| Keep selectively | read-only independent evaluator | Invoke by risk/difficulty, not universally |
| Simplify | four artifacts plus approval frontmatter and semantic bindings | Preserve stage meaning and approvals; optionally combine small-change records |
| Simplify | exact file ownership guard | Advisory expected scope; hard deny only sensitive paths/operations |
| Simplify | detailed JSONL ledger and audit taxonomy | Small run/evidence record or CI telemetry: task, revision, result, cost, duration, interventions |
| Remove from default | graph, PageRank, co-edit, map, pack, refresh | Use native bounded search; restore only after a representative A/B win |
| Remove from default | revision product-context and local host-evidence model | Use Git, PR, CI, tracker, and deployment records directly |
| Remove from default | local sprint coordination, parent coverage, dependencies, overlap engine | Use issue tracker; one worktree per selected ticket |
| Remove | baseline capture that re-runs `stop` | Measure cached/known output or delete; never execute the suite twice |
| Add | executable product runtime and E2E journey | Make `./dev/run` and real-surface verification first-class |
| Add | risk-adaptive security and performance proof | Project-owned CI profiles driven by contract risk/NFRs |
| Add | production feedback | Telemetry/SLO breach creates a linked incident ticket |

## Evaluation and adoption

### A smaller evaluation portfolio

Maintain three layers:

1. **Kernel unit tests:** offline tests for projection, command invocation, protection, workflow transitions, restart behavior, and evidence schema. Retain meaningful regression coverage; test count is not a deletion target.
2. **Representative product trials:** roughly 8–12 tasks across at least one greenfield and one brownfield product: routine feature, bug reproduction, ambiguous request, cross-file change, migration, security-sensitive change, performance regression, and production-style failure.
3. **Real delivery telemetry:** accepted PRs, escaped defects, lead time, cost, human interventions, false blocks, review findings, rollback rate, and DORA-style stability outcomes.

Each behavioral trial must grade final state with hidden or independently owned assertions. Run multiple trials for stochastic comparisons. Preserve incomplete runs and infrastructure failures separately. Never count “agent said done” as success.^6

### Compare against the real baseline

The control is native Claude Code or Codex with the repository's ordinary guide and project commands—not naive whole-file reading and not an artificially weak prompt. Run paired tasks with the same model, effort, tools, environment, resource limits, and candidate assertions.

Evaluate:

- accepted outcome rate and pass@1;
- escaped regression and verification-failure rate;
- human interventions and false blocks;
- wall-clock time and time to review-ready PR;
- token and monetary cost per accepted change;
- diff size, duplication, complexity, and review findings;
- delivery stability after merge.

Adopt a harness component only when it produces a material, repeatable improvement on one of these outcomes without an unacceptable regression elsewhere. “The mechanism works” and “the model used it” are not sufficient.

### Initial Lean v3 exit criteria

Before replacing v2 in a real team:

- all approved routine product trials advance automatically between stages without a human relaunching them;
- no false scope block in at least 20 representative slices;
- acceptance pass rate is no worse than native within the uncertainty of the sample;
- median cost per accepted change is no more than 10% above native, unless a statistically credible reduction in escaped defects justifies it;
- fast feedback is under two minutes and full candidate feedback under ten minutes for the pilot repositories;
- every R2/R3 candidate has independent review evidence and every release-sensitive action remains externally authorized;
- performance-sensitive slices carry an explicit workload and executable budget;
- two engineers can work in separate worktrees without harness-specific shared mutable state.
- one greenfield and one brownfield pilot complete Plan through Maintain, including a detected seeded incident, diagnosis, regression test, corrective release and observed recovery;
- duplicate events and interrupted jobs do not duplicate changes or releases;
- ordinary tests invoke zero models; live trials are explicit and subscription mode never falls back to API billing.
- all required unit and integration tests execute without Docker, with no Docker-absence skips disguising missing coverage.

These are starting thresholds and should be calibrated from actual team work. The decision should be revisited whenever the underlying model or coding-agent product changes, because harness assumptions become stale as model capability moves.^3

## Claude Code Max, model selection, and unexpected API spending

### What the repository actually does

The following describes the diagnosed pre-change behavior. The implementation update below supersedes it for this working copy.

The harness already calls the native `claude` executable with `-p`; it is not implementing a raw Anthropic Messages API client. Using Claude Code does not itself determine billing: the credential selected by that CLI does.

The observed billing path is:

1. `evals/run.mjs:97` implements `loadDotEnv()`. Both the comparison path and normal live-evaluation path call it automatically before checking authentication.
2. The repository `.env` contains an `ANTHROPIC_API_KEY` assignment. Only its presence was checked; its value was not printed. The shell running this review had no API key or OAuth token set.
3. `evals/lib/invoker.mjs` inherits the resulting environment when spawning `claude -p`. For product trials it forwards selected credential variables into Docker.
4. `claudeAuthenticated(..., {product:true})` deliberately cannot use the host keychain. This explains the environment-token requirement for isolated product trials; an API key specifically is not essential because that function also accepts `CLAUDE_CODE_OAUTH_TOKEN`.
5. `.github/workflows/harness.yml` runs live golden evaluations on qualifying PR changes with a repository API-key secret and a $5 suite budget. A separate manual mechanism smoke also uses the secret. This is a configured paid evaluation policy, not a requirement of normal product tests.

Anthropic documents that an API key present in non-interactive `-p` mode is used, and that `claude setup-token` supplies subscription OAuth for scripts/CI. [16](https://code.claude.com/docs/en/authentication) Consequently, unsetting a shell key alone does not solve this repository's problem: the runner can reload it from `.env`.

The installed CLI is 2.1.266. In this execution environment, `claude auth status` reported `loggedIn: false` and `authMethod: none`. This does not establish the state of a separate interactive terminal or its keychain access. A usable Max login needs confirmation in the environment that will launch agent work.

### Which commands spend model usage

| Command/path | Current behavior |
|---|---|
| `node --test test/*.test.mjs` | Deterministic harness tests, using fake/injected model responses; no model inference required |
| `node evals/run.mjs --dry` | Validates trial definitions; returns before loading credentials or invoking models |
| `node evals/run.mjs` | Live agent evaluations when credentials are available; automatically loads `.env` |
| `--products`, `--compare`, `--prune` | Live multi-phase or repeated campaigns; may invoke both generator and reviewer |
| `node evals/agent-mechanisms.mjs` | Live agent/reviewer smoke calls |
| `harness review` | Independent live Claude Code review; inherits caller credentials |
| PR evaluation job | API-funded live trials on the configured changed paths |

The previous 420-pass test result came from the deterministic command. It was not a paid live evaluation. Costs shown in saved CLI results should also be distinguished from actual invoices: a usage-cost estimate alone does not prove the billing account charged. This review traces the credential route; it does not audit the user's Anthropic billing account.

### Model selection is separate from authentication

The current `.aidlc/harness.toml` explicitly sets `generator = "claude-sonnet-5"`, `evaluator = "claude-opus-5"`, and `evals = "claude-haiku-4-5-20251001"`; `.aidlc/lib/config.mjs` contains corresponding defaults. No Opus 4.7 requirement was found in these active configurations. These are configured identifiers, not a claim that every account can access them.

For normal development, let the user choose the model available in Claude Code; record the actual model used. A separate review context may use the same model—independence does not require purchasing another model. Reserve explicit version pins for reproducible comparisons, expose the choice before launch, and stop with an actionable error if unavailable. Do not benchmark a weak model as a proxy for the competent agent the team actually uses.

### Required implementation changes, in priority order

1. Make ordinary checks entirely offline. Live trials must require an explicit option, with selected tasks, authentication route, model and limits visible before launch. Dry mode must neither load credentials nor make inference calls.
2. Make subscription authentication the local default. Do not automatically load repository `.env` into agent processes. Refuse conflicting API/gateway/provider configuration in subscription mode and confirm the effective authentication route; simply removing one environment variable is insufficient when helpers or profiles are configured.
3. API mode is excluded by the user's explicit direction. Reject API credentials rather than adding an optional paid fallback.
4. For local Claude Code, use the user's Max login. For isolated native-CLI runs, use the documented `claude setup-token` flow and supply `CLAUDE_CODE_OAUTH_TOKEN` securely to the selected run; do not mount an entire host credential directory or reuse subscription tokens in a custom API client. The current product invoker already forwards this token, but the current `.env` API key must not be allowed to override it.
5. Move live CI evaluations behind an explicit manual/approved trigger. Keep offline CI required on each PR. Update the current eval-gate policy and its regression tests together so optional live evidence cannot become a mandatory missing-secret failure, and skipped live evidence is labeled accurately.
6. Keep model use bounded under Max too: timeouts, turn limits, two repair attempts, one campaign at a time initially, and a durable pause when quota is exhausted. Never fall back automatically to API credits. Max has shared usage limits; additional usage credits can still incur charges if enabled. [17](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)

Implementation update: the local runner no longer loads `.env`, requires `--live`, rejects conflicting API/provider variables, and checks subscription authentication. Each native Claude launch also enforces `forceLoginMethod: claudeai` and a 30-turn bound. Product containers receive only the subscription OAuth token. Independent reviews and mechanism smokes share the guard. CI configuration now has only a manual subscription smoke and no API-key reference. Ordinary tests and dry validation remain offline. The existing `.env`, account billing settings and hosted workflow have not been modified.

Use `node --test test/*.test.mjs` and `node evals/run.mjs --dry` for routine verification. For interactive agent development, sign into the Max account with `claude auth login`, then confirm `/status` inside Claude Code. Authentication success and actual subscription inference have not been verified here; no live trial was launched during this work.

Verification of the subscription changes: a clean disposable clone ran 436 offline tests: 423 passed, 12 environment-dependent tests skipped, and one README/origin consistency test failed because the clone's origin was a local path. That test passed after correcting the clone's origin metadata. The focused 32-test authentication/invocation/contracts/review suite also passed in the working checkout. Dry validation succeeded; a live request without subscription credentials refused before inference even with the repository API-key `.env` present. No inference usage was incurred by this verification.

## Six-week implementation proposal

### Week 1 — Freeze and establish the baseline

- First separate offline tests from explicitly requested live trials and implement the subscription/API distinction above. Verify it with fake CLI invocations before any live evaluation.
- Tag the current repository as the research reference.
- Do not add another control.
- Select one greenfield and one brownfield pilot repository.
- Add only the four project commands and a concise guide to each.
- After authentication is confirmed, explicitly select a bounded set of native-agent baseline tasks and record outcome, time, usage, interventions, and defects. Stage the 8–12-task portfolio across the available subscription allocation.

### Week 2 — Build the thin kernel by extraction

- Create a new `lean-v3` branch or adjacent package rather than deleting research history in place.
- Retain init/projection, candidate identity, command invocation, worktree guidance, and sensitive-operation protection.
- Implement the two hooks and small evidence summary.
- Use the issue/PR as the routine contract.
- Set an explicit feature budget: no custom graph, approval database or deployment engine; use existing workflow scheduling for the small dispatcher.

### Week 3 — Add risk-adaptive quality profiles

- Define R0–R3 classification in the guide, not a large policy engine.
- Wire project CI for correctness, dependency/security checks, and candidate artifacts.
- Add one performance-sensitive example with an operation/query-count test and stable benchmark runner.
- Add independent review only for R2/R3.

### Week 4 — Run complete product journeys

- Implement the small dispatcher and test duplicate events, interrupted stages and exhausted budgets offline.
- Greenfield: PRD through release to a seeded staging incident, diagnosis, corrective slice and verified recovery.
- Brownfield: characterize a defect, repair it, release through the existing pipeline, and show no regression or performance loss during the observation window.
- Exercise session restart and handoff using only ticket, Git, and concise evidence.
- Record every point where a human must intervene and every unnecessary block.

### Week 5 — Paired comparison and subtraction

- Run native versus Lean v3 under matched environments and repeated trials.
- Inspect traces, not just aggregate scores.
- Remove any hook, prompt rule, artifact field, or reviewer pass without a demonstrated failure it prevents.
- If a custom component does not justify its cost, replace it with native platform behavior while preserving the complete lifecycle and its required handoffs.

### Week 6 — Team pilot and operating decision

- Complete at least 20 real slices across the two repositories with two or more engineers.
- Review escaped defects, delivery stability, false blocks, human attention, and cost.
- Publish a one-page operating guide and the measured adoption decision.
- Keep the research/evaluation machinery outside the installed product kernel.

## Final recommendation

The current repository has successfully discovered that governance machinery can itself become the dominant product. Its most valuable assets are not the number of controls; they are the discipline of executable checks, honest evidence, isolation, outcome-based product trials, and willingness to remove mechanisms that do not earn their cost.

Lean v3 should begin with billing predictability and a complete lifecycle pilot, followed by measured simplification:

- one product planner at initiative boundaries;
- one native coding agent per change;
- one optional independent reviewer for consequential work;
- one issue or one compact change contract;
- four project commands;
- two deterministic hooks;
- one authoritative CI run;
- one small dispatcher connecting accepted artifacts and evidence through Maintain;
- offline routine tests and explicit subscription-backed live trials;
- external human authority for merge and release.

Everything else must win its way back through representative paired evidence. This design is more likely to produce clean, readable, performant software because it directs investment toward the product's architecture, tests, runtime, security, and performance budgets—the surfaces that actually constrain code quality—rather than toward an increasingly sophisticated protocol around the model.

## Sources

1. OpenAI. “[Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/).” 11 February 2026.
2. Anthropic. “[Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents).” 26 November 2025.
3. Anthropic. “[Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps).” 24 March 2026.
4. Xia, Chunqiu Steven, et al. “[Agentless: Demystifying LLM-based Software Engineering Agents](https://arxiv.org/abs/2407.01489).” 2024.
5. Yang, John, et al. “[SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering](https://arxiv.org/abs/2405.15793).” 2024.
6. Anthropic. “[Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).” 9 January 2026.
7. Anthropic. “[Quantifying infrastructure noise in agentic coding evals](https://www.anthropic.com/engineering/infrastructure-noise).” 5 February 2026.
8. Becker, Joel, et al. “[Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity](https://metr.org/Early_2025_AI_Experienced_OS_Devs_Study-paper.pdf).” METR, 2025.
9. Google Cloud DORA. “[Announcing the 2025 DORA Report: State of AI-Assisted Software Development](https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report).” 23 September 2025.
10. OWASP. “[Secure Coding with AI Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secure_Coding_with_AI_Cheat_Sheet.html).” Accessed 10 September 2026.
11. NIST. “[Secure Software Development Framework (SSDF) Version 1.1](https://csrc.nist.gov/pubs/sp/800/218/final).” SP 800-218, February 2022.
12. Anthropic. “[Automate workflows with hooks](https://code.claude.com/docs/en/hooks-guide).” Claude Code documentation, accessed 10 September 2026.
13. Anthropic. “[Orchestrate teams of Claude Code sessions](https://code.claude.com/docs/en/agent-teams).” Claude Code documentation, accessed 10 September 2026.
14. Anthropic. “[Building a C compiler with a team of parallel Claudes](https://www.anthropic.com/engineering/building-c-compiler).” 5 February 2026.
15. Anthropic. “[The AI-Native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook).” Accessed 10 September 2026.
16. Anthropic. “[Authentication](https://code.claude.com/docs/en/authentication).” Claude Code documentation, accessed 10 September 2026.
17. Anthropic. “[Use Claude Code with your Pro or Max plan](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan).” Accessed 10 September 2026.

## Repository evidence inspected

- `README.md`, `docs/CONSTITUTION.md`, `docs/OPERATING.md`, `docs/IMPROVEMENT-PLAN.md`, and `docs/SPDD-TEAM-EVOLUTION-PLAN.md`
- `.aidlc/harness.toml`, canonical instructions, skills, roles, hooks, checks, and library implementation
- `evals/tasks.json`, `evals/products.json`, product evidence, pruning evidence, and native/graph/generation comparisons
- `.aidlc/evals/results/2026-09-06T14-53-28-712Z.json` and `.aidlc/evals/results/2026-09-06T15-42-55-342Z.json`
- deterministic command: `node --test --test-reporter=tap test/*.test.mjs`
- retrieval command: `node evals/bench/pack-bench.mjs`
- repository inventory and current harness status at commit `2b626692a64f0c83aa87ac466ed715d935f987f3`

Limitations: the paired comparisons have small samples; several planned trials were incomplete or unmeasured; the product campaigns use simulated approval decisions; the deterministic Docker-dependent cases were not executed in the local test run; and no live team was observed during this review. Recommendations that extrapolate beyond the recorded trials are engineering judgments, explicitly separated from measured repository results above.
