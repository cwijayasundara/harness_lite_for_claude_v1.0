# Company AIDLC Harness v1 — implementation plan

## Outcome

A repository-native control system in which humans govern intent and consequential decisions,
agents execute versioned delivery contracts, deterministic sensors produce evidence, and provider
adapters connect work intake, deployment, and operations without entering the kernel.

The public lifecycle is one loop:

`intent -> contract -> implementation -> evidence -> review -> deploy -> observe -> intent`

Stories are optional decomposition units. A rendered model prompt is a receipted projection of the
contract, not another hand-edited source of truth.

## Implementation status — 2026-08-26

| Phase | Status | Evidence / remaining gate |
|---|---|---|
| 0 — truthful baseline | **Deterministic work complete; authenticated eval pending** | Legacy histories are explicitly archived, terminology and scanner policy are decided, token ratchets pass, and deterministic checks are green. The current 22-task Claude run is assigned to Claude Code because this environment is not authenticated. |
| 1 — delivery-contract experiment | **Production-ready opt-in; not adopted** | Contracts now fail closed on unattributed decisions, mutable provenance, uncommitted gates, stale digests, malformed identity/structure, collisions, and evidence overwrite. `contract validate --all` is available for pilots. Adoption remains blocked by authenticated comparative results. |
| 1B — coding-agent portability | **Implemented baseline** | Canonical `.aidlc` sources, capability negotiation, generated projections, and Claude/Codex conformance tests exist. Cursor, Copilot, and Grok still require provider conformance fixtures before being called supported. |
| 2 — contract-driven kernel | **Complete** | Contracts are the default creation, scope, evidence, and review path. Legacy spec/plan creation and handoff automation are removed; read-only migration compatibility remains. Authenticated comparison remains post-adoption validation. |
| 3 — model roles and committed handoffs | **Complete** | Four neutral roles, central Sonnet 5/Opus 5 resolution, policy digests, real Claude Code invocation with scoped tools and structured output, immutable run/handoff/evaluation receipts, evaluator independence, fail-closed findings, explicit outage fallback, cost/timeout enforcement, and bounded repair decisions are implemented and tested. No provider SDK or credential enters the kernel. |
| 4–8 | **Not started** | Must satisfy the preceding phase exit criteria; later-phase code does not enter early for convenience. |

**Pending with Claude Code:** run the authenticated 22-task model suite and retain its result.

**Next adoption milestone:** run old-chain and delivery-contract tasks side by side. Do not begin
Phase 2 contract adoption until the model suite is green and the contract path is no worse on task
success while reducing editable sources, drift, or review burden.

## Non-negotiable budgets

| Surface | Kernel limit |
|---|---:|
| Skills | 6 |
| Agent definitions | 3 |
| Hook bindings | 3 |
| Work-item, SCM, deployment, or monitoring providers in core | 0 |
| Default evaluator invocations | 2 |
| Critical evaluator invocations | 4 |

These are target limits for the company kernel, not permission to add to the current full budget.
Migration must reduce the current surface before company v1. A new control needs a failing eval or
production defect, a runtime and token budget, a measured false-positive rate, and a deletion rule.

## Architecture boundaries

1. **Kernel:** lifecycle, contract validation, capability execution, evidence, receipts, ledger.
2. **Agent portability:** canonical roles, skills, hook intents, and capability negotiation are
   rendered through thin provider adapters. Native agent files contain no policy or sensor logic.
3. **Agent provider:** model-role resolution and invocation. Initial policy maps generation to
   Sonnet 5 and evaluation to Opus 5, but artifacts never contain a floating model alias alone.
4. **Work-item adapter:** Jira, Azure Boards, Linear, or Git through one `WorkItemPort`.
5. **Delivery adapter:** immutable artifact deploy, status, verify, promote, and rollback.
6. **Operations adapter:** collect, detect, incident, recovery verification, and loop-back intent.
7. **Policy distribution:** required capabilities and risk rules, managed outside project control.

## Phase 0 — truthful baseline

Repair invalid lifecycle histories, restore the token baseline, pass every task in the model-eval floor, reconcile
intent-acceptance terminology, and decide whether the zero-firing secret scanner is a corporate
baseline or an evidence-driven control.

Exit: deterministic suite, lifecycle, baseline, and model evals are green with no unexplained
ledger action.

## Phase 1 — delivery-contract experiment

Add experimental `aidlc.intent-ref/v1`, `aidlc.contract/v1`, and `aidlc.evidence/v1` artifacts.
The contract combines the logical spec, structured execution prompt, plan, safeguards, and proof.
Spec and plan remain separate approvals tied to content digests. The existing artifact chain stays
supported while comparative evals measure success, tokens, corrections, drift, and review quality.

Exit:

- invalid or stale approval digests fail validation;
- one external and one Git intent reference validate;
- evidence is bound to the exact approved contract digest;
- direct intent-to-contract and story-grain contracts are representable;
- no skill, agent, or hook is added;
- comparative fixtures can run old and experimental paths side by side.

## Phase 1B — coding-agent portability contract

Add a vendor-neutral agent manifest and an adapter conformance boundary before adopting the new
contract. The portable baseline is repository instructions, Agent Skills, harness CLI execution,
MCP capability declarations, structured receipts, and CI enforcement. Subagents, hooks, plugins,
and model pinning are negotiated native accelerators; they are never assumed to be equivalent or
used as the only enforcement boundary.

The first slice implements `harness agents list|doctor|render|verify`, a capability schema, and
Claude Code and Codex adapters. Rendering is deterministic and generated native files carry their
source digest. Cursor, GitHub Copilot, and Grok Build enter only through the same adapter contract
and conformance suite. Grok's claimed Claude compatibility is tested, not trusted as an alias.

`.aidlc/` is the canonical installed namespace and physically owns the runtime, checks,
configuration, artifacts, evidence, and state. `.claude/`, `.agents/`, `.cursor/`, and `.github/`
are provider projections. The repository root is the distributable plugin boundary; the Claude
manifest selects `.claude` components while its hooks execute `.aidlc/bin/harness`.

Exit:

- the canonical manifest contains roles and policy requirements, not vendor file paths;
- Claude Code and Codex render from the same source and pass golden conformance tests;
- unsupported capabilities are reported explicitly and never silently weakened;
- every native hook delegates to a shared `harness` command;
- evaluator isolation, read-only access, and actual model receipts remain kernel requirements;
- deleting all generated provider files leaves delivery contracts and evidence intact;
- provider adapters add no sensor or lifecycle logic to the kernel.
- `.claude/` contains no kernel, lifecycle, sensor, artifact, evidence, or mutable state code.
- reusable skills, roles, instructions, review policy, and hook intent have exactly one canonical
  source under `.aidlc/`; provider directories contain generated projections only.

## Phase 2 — contract-driven, agent-portable kernel

Adopt the contract only if Phase 1 is no worse on success and demonstrably reduces artifact and
review burden. Add lifecycle transitions, prompt manifests, compatibility reads for old artifacts,
and evidence-to-behaviour traceability. Remove superseded spec/plan machinery in the same release.

Exit: fewer editable sources of truth than the baseline; upgrade and rollback rehearsed.

## Phase 3 — model roles and committed handoffs

Add provider-neutral roles `specify`, `generate`, `evaluate`, and `diagnose`. Resolve centrally
managed aliases to pinned model IDs and record the resolution. Generation and evaluation use
independent contexts. Handoffs identify committed Git state and contract digest. Evaluation is
read-only; repairs return to the generator; loops terminate after a configured maximum.

Exit: the generator cannot approve itself, malformed findings fail closed, and outage/fallback,
cost, timeout, and loop termination are tested.

The Claude Code provider adapter performs the initial real invocation path. It consumes a kernel
resolution and returns validated run output; it owns Claude CLI flags and parsing. Additional
providers must pass the same receipt contract and may not add lifecycle logic to the kernel.

## Phase 4 — sensor gauntlet · **COMPLETE**

Orchestrate project-supplied capability verbs for correctness, test quality, structural fitness,
security, and runtime verification. Borrow SwarmForge's separation of quality ownership without
copying its language-specific tools or fixed two/four/six-agent topologies. Evaluator profiles are
`behaviour`, `architecture`, `hardening`, and `qa`; each survives only if seeded defects prove its
incremental value.

Exit: Python, TypeScript, and one JVM/.NET/Go project reject do-nothing, test-cheating,
boundary-breaking, and security-defective changes within the latency budget.

Implemented as four fail-closed profiles over project-owned capability commands, with a durable
`aidlc.sensor-run/v1` receipt and experiment qualification that requires incremental seeded-defect
value. The zero-install conformance suite proves healthy baselines plus all four defects across
Python, TypeScript, and JVM-shaped projects; see [`SENSOR-GAUNTLET.md`](SENSOR-GAUNTLET.md).

## Phase 5 — one work-item adapter · **COMPLETE**

Implement `resolve`, `snapshot`, `create`, `transition`, `link_commit`, `link_contract`, `link_pr`,
and idempotent `comment`. Choose the first pilot pod's provider; add Jira, Azure Boards, and Linear
only after the shared conformance suite passes. Exactly one authority (`external` or `git`) is
declared per intent.

Exit: retries do not duplicate writes, external drift invalidates affected approval, authorization
fails closed, and an agent cannot accept or close its own intent.

Implemented with Jira Cloud as the first pilot adapter, a provider-neutral `WorkItemPort`, durable
receipts, verified-human transitions, automatic downstream drift gates, and a thin MCP projection.
Provider- and HTTP-level conformance proves retry safety for create/transition/link/comment and
denial before provider access; see [`WORK-ITEMS.md`](WORK-ITEMS.md).

## Phase 6 — deployment adapter · **COMPLETE**

Implement `preflight`, `deploy`, `status`, `verify`, `promote`, and `rollback` against one real
staging platform. Promote the same immutable artifact digest. Model reasoning may diagnose a
failure but may not invent a deploy command. Risk policy controls production authorization.

Exit: staging deploy/verify/rollback and production denial are rehearsed; every action emits a
durable receipt; failed verification prevents promotion.

Implemented as six fixed operations with immutable artifact state, latest-verification promotion
gating, risk-based production authorization, rollback history, structured receipts, and a real
Docker Compose staging provider. Unit conformance is zero-install; the scheduled/manual CI
rehearsal deploys and verifies two public immutable image digests, proves production denial, and
rolls back to the first. See [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Phase 7 — maintenance adapter

Connect one real metric or incident source. A deterministic band or explicit event triggers
deduplicated incident creation; an evaluator diagnoses; the generator proposes a remediation PR;
recovery is measured; the incident becomes a permanent regression eval. Automated rollback is
limited to pre-approved deterministic conditions with a circuit breaker.

Exit: a synthetic production failure completes `detect -> incident -> intent -> fix PR -> deploy
-> recovery`, including duplicate, model-failure, and maximum-attempt cases.

## Phase 8 — company pilot and release

Run three pods across three technology stacks for six to eight weeks. Compare against historical
or matched baselines: intent-to-merge, first-pass CI/review, human interventions, false blocks,
escaped defects, change-failure rate, cost per accepted PR, deploy recovery, and onboarding time.

Company v1 requires improved cycle time without a concerning defect increase, completed security
and architecture review, managed identity and audit export, rollout rings, emergency disable,
compatibility policy, support ownership, and proven uninstall/rollback.

The three-pod pilot must include at least two coding-agent products. A provider passes only when
the shared seeded-defect suite produces equivalent gate decisions and evidence; matching prompts
or user experience is not required.

## Anti-bloat release rule

Every phase is independently releasable and abandonable. Work from a later phase may not enter an
earlier one for convenience. Every fourth release is subtraction-only. Each change reports kernel
LOC, skills, agents, hooks, config keys, prompt tokens, runtime, concepts added, and concepts
removed. A provider-specific noun in kernel policy or sensor logic is a boundary failure. Adapter
code may name its provider but has a size budget and must render from canonical content. Generated
provider files are disposable build artifacts, never additional sources of truth.
