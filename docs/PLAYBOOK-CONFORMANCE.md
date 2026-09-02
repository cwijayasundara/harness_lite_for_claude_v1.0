# Playbook conformance

How this harness maps to the six stages of the [AI-native SDLC
playbook](https://claude.com/blog/the-ai-native-sdlc-playbook), and where it knowingly deviates.

Written so the deviations are auditable rather than implied. A harness that claims conformance it
does not have is worse than one that names the gap.

## The one structural difference

The playbook names three artifacts before implementation: `intent.md`, `spec.md`, `plan.md`. This
harness produces `intent.md`, an **intent ref**, and a **delivery contract** whose spec and plan
are sealed sections of one file rather than two files.

This is a difference of layout, not of governance. The playbook's requirement is that a human
approves the spec before build and the plan before implementation, and that "every stage ends by
committing an artifact the next stage reads". The contract keeps both gates as independently
sealed sections, each with its own approval digest, and the tooling enforces the ordering:

```
$ harness contract seal <slug> --scope plan
approve the spec before sealing the plan
$ harness contract seal <slug> --scope spec
commit this approval before continuing
```

Two gates, two digests, ordered, with a commit forced between them. `scope-drift` then enforces
the plan's declared file ownership on every commit — the playbook only asks that alignment
between diff and plan be *measured*; this enforces it.

## Stage by stage

| Playbook stage | Artifact here | Gate | Status |
|---|---|---|---|
| **Plan** — `intent.md`, product owner approves | `.aidlc/artifacts/intent/<slug>.md` + `intent-refs/<slug>.json` | `decision.status` must be `accepted` **and committed** before the spec can seal | conformant |
| **Design** — `spec.md`, constrained by org skills, concerns flagged | `## Observable behaviours`, `## Entities`, `## Approach`, `## Safeguards` in the contract; sealed by `--scope spec` | human seals; digest pins the text | conformant on the gate, **deviating on org skills** (below) |
| **Build** — approved `plan.md`, CLAUDE.md conventions, skills advise, hooks block | `## Structure and ownership` + `## Operations`, sealed by `--scope plan`; `.claude/CLAUDE.md`; 10 skills; 5 hook bindings | plan seal required before implementation; `scope-drift` enforces owned paths; `require_contract` blocks unowned writes | conformant |
| **Test** — session verifies its own work; agent config gets an eval suite in CI | `harness check --stage stop`; 22-task eval suite over 11 fixtures; `harness evals gate` ratchet | `--stage stop` before "done"; per-task ratchet on the eval record | **deviating** — the suite does not run in CI |
| **Deploy** — layered agentic review against a committed `REVIEW.md`, no route past the production gate | `.aidlc/policies/review.md`; `.aidlc/artifacts/review/<slug>.md`; `harness deploy` with approval identifiers | human PR approval is the final gate; agent cannot approve or merge | **deviating** — the review pass is run by a session on request, not automatically on every PR |
| **Maintain** — script watches production, band breach invokes Claude, writes `intent.md`, loop closes | `harness monitor detect`, `bands.json`, 3σ staging rollback, `harness new intent` | 1σ log, 2σ read-only diagnose, 3σ propose | built, **unmeasured** — no production traffic behind it |

## Known deviations

Three, all deliberate, all consequences of one decision.

### 1. The eval suite does not run in CI

The playbook's Test stage requires that "the config steering the agent gets its own eval suite in
CI", so a change to `CLAUDE.md`, a skill, or `harness.toml` cannot merge without eval evidence.

Here the suite runs locally, on request. `ci-runs-without-a-key` records the reason: the
repository owner decided on 2026-08-24 not to add an `ANTHROPIC_API_KEY`, and no model-invoking
job may run on GitHub. Until that changes, a steering-surface change can merge with no eval
evidence at all.

Partially mitigated as of `858f711`: `harness evals gate` compares a run against a committed
per-task record and fails on any regression, so the evidence exists when someone runs it. It is
not automatic.

### 2. Agentic PR review is not automatic

The playbook's Deploy stage expects every PR to get an identical set of review passes. The review
policy is committed and the passes are real, but they execute when a session is asked to run
them, not on push.

Same root cause, and `ci-runs-without-a-key` already flags the consequence: *"Automated PR review
stops running, so Gate 3 becomes entirely human... Accepting this is a reasonable trade for a repo
with one committer working on `main`; it would not be for a team."*

### 3. Skills carry process, not policy

The playbook's Design stage produces a spec "constrained by the organization's skills" — skills
encoding security, brand, and compliance, with contradictions flagged.

All ten skills here encode **engineering process**:

> coverage-first · diagnose · implement · intent · map · pin-behaviour · pure-refactor · review ·
> sprout · tdd-first

None encodes domain policy. Nothing constrains a spec on security or compliance grounds, and
nothing flags a contradiction between an intent and an organizational rule. The skill budget is
10/10, so adding a policy skill means deleting a process one — which makes this a design decision
rather than an oversight, and it is unresolved.

## Measurement

The playbook makes indicators part of governance. `harness status` prints them:

```
playbook
  intent survival             ...
  time to committed intent    ...
  spec rework after plan      ...
  first-pass review           ...
  eval pass rate              ...
```

These are computed from the contract chain — intent ref decision, contract seal digests, review
artifact. Before `indicators-on-the-contract-chain` they were computed from the pre-contract
four-file lifecycle, which the repository had stopped producing, so every one of them except eval
pass rate read `unmeasured` while real work went through the contract chain.
