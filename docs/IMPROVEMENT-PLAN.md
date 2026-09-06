# Improvement plan: dependable engineering with a lean harness

Date: 2026-09-06. Implementation authorized by the user's instruction to save this plan
and start implementation. This records conversation authorization, not a fabricated CLI
approval or a claim that the existing artifact gates have been exercised.

## Outcome and constraints

Help a capable coding model deliver correct, maintainable product changes with concise
guidance, executable feedback, and human-approved intent, design and implementation scope.
Prove the result through automated integration campaigns, not manual product trials.

- Improve this repository; do not build another orchestration framework.
- Add no production skills, agents or hook bindings; do not increase control budgets.
- Repair or remove existing mechanisms before considering new controls.
- Use production-intended capable models for product trials. Cheap models are optional stress
  tests, not the basis for adding controls when they struggle with the workflow.
- Keep tests, expected outcomes and simulated approval authority outside the agent's writable
  environment. A temporary directory alone is not a security boundary.
- Preserve real human approval in product work. Scripted test decisions are labelled simulations.
- Do not modify another agent's pending work or rewrite existing approvals to cover this change.

## 1. Correct existing mechanisms (delivery A, then B)

| Gap | Change | Acceptance evidence |
|---|---|---|
| Sensor errors report success | Existing runner rejects errored configured checks; unused empty capabilities remain explicitly skipped | Real CLI returns nonzero for missing command, malformed structured output and process termination; successful checks still pass |
| Evaluator can modify its subject | Explicit base/candidate revisions, fresh evaluation context, read-only source access; runner saves findings and runs checks | Evaluator receives the intended candidate, cannot alter source/tests, and reports a seeded defect |
| Digests mistaken for human identity | Approval authority outside generator writes; bind plan to spec revision and approval to artifact revision | Missing, rejected, fabricated and stale approvals do not permit implementation |
| Agent self-approval in campaigns | External driver supplies labelled decisions through the ordinary approval path | Actual Claude Code pauses, accepts correction, resumes; no self-approval bypass flags |
| CI conditions and trigger gaps | Supported secret conditions; include executable and canonical steering inputs | Workflow validation, executable path-filter tests, then real CI smoke run |
| Result selection and readiness | Select newest full run correctly; report absolute outcomes separately from regression comparison | Partial run cannot displace full run; historical failures and incomplete runs remain visible |
| Misleading claims | Correct cache guidance and test-presence naming; document heuristic limitations | Tests no longer demand obsolete cache behaviour or confuse test presence with assertion quality |

Required check failure prevents verified completion, not diagnosis. Optional graph failure remains
advisory. Do not turn an absent optional capability into a new mandatory requirement.

## 2. Simplify daily guidance (delivery B)

Keep intent.md (problem/outcome), spec.md (behaviour/design/safeguards), plan.md
(approach/scope/proof), and review findings (defects/evidence/uncertainty).
Use existing skills to encourage system understanding, consequential clarification, existing
patterns, small behavioural slices, reproduction before fixes, runtime verification and honest
reporting. Remove mandatory invented questions, splitting on the word "and", and blanket bans
on legitimate test maintenance. Material design/scope changes return to a human; routine choices
inside the approved boundary do not.

Acceptance: fewer workflow-repair turns and unnecessary questions on the same scenarios, with
unchanged product correctness and preserved approval boundaries.

## 3. Automated product integration trials (delivery C)

Extend evals/run.mjs and evals/lib/{stage,invoker,campaign,assertions}.mjs. Keep test orchestration
outside the production kernel. Do not build another runner or a generic approval service.

The external driver stages a disposable repository, starts actual Claude Code, supplies one
requirement at a time, issues scripted decisions, introduces failures, and independently grades
the product. Private assertions and future requirements are not exposed to the agent. A simulated
approval proves the protocol, not the quality of arbitrary human judgment.

Three layers:

1. Deterministic integration tests run the real CLI, checks and artifact transitions without models.
2. Agent integration tests prove the actual CLI loads the intended plugin and obeys approval flow.
3. Product campaigns evolve the same product across changes and new sessions with model calls.

| Campaign | Product sequence | External verification |
|---|---|---|
| Existing invoicing ledger | Characterize, partial payments, overdue rule reversal, storage refactor, documentation | Public API behaviour, compatibility, regression cases, current product description |
| Small greenfield service | Create, validate, persist, change requirement, reproduce/fix defect, restart | HTTP behaviour, persisted state, error handling, restart and acceptance tests |

Extend the ledger first. Replace transcript praise and test-name assertions with actual behaviour
where possible. Include rejection/correction/approval, stale approval, session restart, missing
tool, seeded review defect and repair, external file rename, superseded requirement, and local
operational failure producing a new intent. Use local disposable deployment only.

Record incomplete executions and preserve reproducible failure evidence. Open-ended architecture
review is supporting model judgment; deterministic product acceptance is the primary evidence.
Both campaigns must run without manual intervention or agent self-approval.

## 4. Compare against capable native Claude Code (delivery D)

Run comparisons sequentially:

1. Native Claude Code with normal project instructions/tools/tests versus the corrected harness,
   holding the capable model constant.
2. Corrected harness with versus without graph assistance.
3. Strong-model implementation versus less expensive generation plus strong independent evaluation.

Record actual model IDs, tool versions, harness/fixture/candidate revisions, outcomes, regressions,
approval violations, retries, unnecessary questions, cost, latency and available token/cache usage.
Include failed, abandoned and budget-exhausted attempts in comparisons. Missing credentials or
models mean unmeasured, never silent substitution. Calibrate bounded spend before repeated runs;
an unaffordable suite is not a useful gate.

One infrastructure smoke run per configuration, then three paired repetitions initially. Small
samples guide decisions; they do not establish universal reliability. Prefer cost per accepted
change over token price. Compare graph retrieval against competent rg plus bounded reads, repair
the deleted-symbol benchmark, and reconcile graph freshness after shell edits, renames and branch
changes. No graph database or custom compiler is planned.

## 5. Prune using product outcomes (delivery D)

Remove or simplify one suspected redundant/friction-producing mechanism in an experimental
configuration, rerun the same campaigns, and compare correctness, recovery, cost and autonomy.
Retain the simpler version when outcomes are equivalent or better. Firing frequency is not
benefit: false blocks are costly, and rarely used approval boundaries can still matter.

First fix the product, guidance, environment or existing mechanism. Consider a new control only
after repeatable product evidence shows it necessary.

## Delivery and verification record

| Delivery | Status | Scope |
|---|---|---|
| A | Mechanisms implemented; acceptance in progress | Honest execution/reporting, CI validation and explicit read-only evaluator |
| B | Partially implemented | External simulated decisions and spec-bound plans implemented; guidance simplification pending |
| C | Pending | External product acceptance and two unattended campaigns |
| D | Pending | Comparative model/graph trials and evidence-based pruning |

First implementation slice: runner aggregation, malformed structured reports, full-run selection,
absolute result reporting and CI conditions/trigger coverage. Files: .aidlc/lib/runner.mjs,
.aidlc/lib/normalize.mjs, .aidlc/lib/eval-gate.mjs, .github/workflows/harness.yml, and their existing
tests. Verification: reproduce failures first, targeted tests, full stop check, and commit-stage
diagnostics. Existing approval records remain untouched; any scope-check mismatch is reported.

No release readiness is claimed until agent integration and product campaigns have run. Mocked
invokers and passing kernel unit tests alone do not establish dependable product delivery.

### First slice implemented, 2026-09-06

- Configured sensor errors now make `check` unsuccessful, participate in fail-fast, and remain
  recorded as errors. `--all` still runs the remaining checks for diagnosis. Unconfigured optional
  capabilities remain skipped. Signal termination is reported as an execution error.
- Structured report parsing failures are findings even when the command exits zero.
- Full-run selection no longer indexes the filtered list with the unfiltered list's length.
- Eval output includes absolute passed/total counts and each non-passing outcome. The existing
  regression gate remains a regression comparison; it is not a new readiness policy.
- CI secret availability is passed through an environment value, and the path filter includes
  the executable, instructions, review policy, adapters, plugin metadata and evaluation fixtures.

Regression tests first produced four failures against the old implementation. The targeted
52-test run then passed. Additional coverage exercises fail-fast after an error, `--all`, optional
capabilities and the workflow's actual grep filter against representative changed paths.

Full verification:

```text
harness check --stage stop
PASS  secrets     83ms
PASS  test        11783ms

harness check --stage commit --all
PASS  secrets     77ms
PASS  test        13431ms
FAIL  scope-drift
PASS  budget      3ms
PASS  tamper      34ms
PASS  arch        29ms
PASS  test_quality 30ms
```

The scope diagnostic still selects the prior `close-the-harness` change. Its approved file list
does not cover this conversation-authorized iteration. That earlier contract and its approvals
were not rewritten, and the check was not bypassed. The changes remain uncommitted. Approval
reconciliation belongs in delivery B before merge; conversation authorization is recorded above.
The pre-existing CODEBASE-MAP.md modification was left untouched.

Not yet verified: live GitHub Actions execution, actual model integration, evaluator isolation,
external approval protocol, or product campaigns. No paid model trials were launched in this slice.

### Correct existing mechanisms implemented, 2026-09-06

This iteration repairs the existing paths without adding skills, roles, hook bindings or control
budgets. Hook dispatch is shorter after removing campaign self-approval and forced continuation.

- `harness review --base <commit> --candidate <commit> --out <file>` resolves both revisions,
  exports the exact candidate/diff, invokes the configured evaluator in a fresh context with
  Read/Grep/Glob only, and saves its findings. Native safe mode disables customizations; strict
  MCP configuration excludes other tool servers. Invalid, failed or empty model output is an
  incomplete review. Runtime checks remain a separate trusted-runner responsibility.
- New plan approvals record `spec_digest`; changing and re-approving the spec invalidates the
  earlier plan. Local digests and `--by` remain audit metadata, not authenticated identity.
- `evals/lib/approvals.mjs` keeps simulated decisions and full-artifact receipts in the parent.
  Campaign steps can reject/approve a named gate, then require both receipts before launching an
  `implement` step. Recomputed local hashes, fabricated identities, stale revisions and absent
  external decisions do not satisfy that driver. Decisions use the ordinary approval function.
- Removed `AIDLC_EVAL`/`AIDLC_UNATTENDED` approval exemptions, self-approval instructions and the
  Stop retry that pushed an agent past an unanswered gate. The invoker strips both legacy flags.
- The existing suite-wide USD flag now reduces each invocation's allowance and reports budget
  exhaustion as incomplete. Missing cost data reserves the whole invocation allowance. This is
  an application budget, not a guarantee about provider billing precision.
- CI now installs the pinned Claude CLI before model tests. The steering filter covers the new
  integration script. Actionlint 1.7.12 validates the workflow; the pinned npm version exists.
- Cache guidance describes instruction reloads accurately. The legacy `test_quality` capability
  is labelled a test-presence heuristic, with its inability to judge assertions made explicit.

Verification: all 254 deterministic tests passed, including failed-campaign receipt/spend reporting; Actionlint passed. Commit-stage
secrets, tests, budget, tamper, architecture and test presence passed. Scope drift still reports
that the older `close-the-harness` plan does not own this iteration. Earlier approvals and the
pre-existing CODEBASE-MAP.md edit are unchanged. This is not a merge-ready claim.

`node evals/agent-mechanisms.mjs` is the opt-in real-Claude integration smoke. It limits planning
to read tools, resumes the same session through rejection/correction, gives implementation tools
only after parent approvals, independently executes product cases, then asks the configured
higher-capability evaluator to find a seeded defect in an explicit candidate. The fixture,
decisions and runtime assertions are supplied by the driver. The first run tested native CLI mechanisms with customizations disabled. The completion pass
below also tests actual plugin loading; neither run replaces end-to-end product campaigns. Its evidence lives under `.aidlc/evals/smoke/`.

Live result: the retry outside the restricted execution sandbox passed all four phases using
Claude Code 2.1.263 and the configured Sonnet/Opus models. The successful run reported $0.1395525.
The initial sandboxed attempt timed out before any model output and returned no billing data;
its cost is unreported, not assumed free. The seeded faulty candidate was
`5ea34ea710040daf428ea911dd73047cb9baeeed`, reviewed while the checkout remained on
`3bee577543d3c1d753f216d13abc4efd631d3033`. Those are disposable fixture revisions, not this
repository's implementation commits.

### Item 1 acceptance completion

The user's subsequent instruction to complete item 1, merge to main and push authorizes this
iteration's scope and delivery. `.aidlc/artifacts/correct-existing-mechanisms/` records that
conversation authority through the ordinary committed spec/plan approval path. It supersedes
the earlier campaign self-approval exception without rewriting historical approvals.

The final integration pass additionally found and corrected stale plugin wiring: the manifest
referenced a deleted reviewer file, and the adapter projection named obsolete hook handlers.
A regression test checks every declared agent exists and the hooks match their canonical policy.
The live smoke now loads the actual plugin for generator turns and verifies its SessionStart
hook executed, then tests pause, rejection/correction, resumed implementation and independent
read-only evaluation. The evaluator still uses a fresh native safe-mode session.

The actual-plugin smoke passed (evidence in `.aidlc/evals/smoke/agent-mechanisms.json`). All
commit-stage controls passed, including scope drift. The Python example's CI environment now
installs its test dependencies and requires a successful stop stage before the cost comparison;
token thresholds and historical outcome expectations are unchanged.

GitHub CI publication and merge evidence will be recorded below. Hosted model execution is an
explicit workflow-dispatch option and fails without its required API key. This repository has no
API-key secret configured; local live-model evidence is reported separately from hosted tests.
Full ledger/service product campaigns and arbitrary-shell trial isolation remain item 3, not
unfinished item-1 mechanism tests.

## Source rationale

- [Anthropic SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook)
- [OpenAI harness engineering](https://openai.com/index/harness-engineering/)
- [Guides and sensors](https://martinfowler.com/articles/harness-engineering.html)
- [Maintainability sensors](https://martinfowler.com/articles/sensors-for-coding-agents.html)
- [SPDD](https://martinfowler.com/articles/structured-prompt-driven/)
- [Matt Pocock skills](https://github.com/pipedrive/mattpocock-skills)
- [SwarmForge](https://github.com/cwijayasundara/swarm-forge)
- [Devin Fusion](https://cognition.com/blog/devin-fusion)
- [Claude Code documentation](https://code.claude.com/docs/llms.txt)
