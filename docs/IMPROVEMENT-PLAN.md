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
| A | Complete for item 1 | Honest execution/reporting, hosted CI and explicit read-only evaluator verified |
| B | Implemented and tested | Daily guidance simplified; bounded comparison found no regression, but friction reduction remains unproven |
| C | Implemented and tested | Both live campaigns passed all 11 changes; private API/HTTP acceptance, failure recovery, saved-revision replay and hosted Docker checks passed |
| D | Item 5 validated; item 4 comparisons incomplete | The matched pruning experiment completed both products in both arms; retain the baseline because the simpler arm showed no operational benefit |

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
Claude Code 2.1.263 and the configured Sonnet/Opus models. The successful native-only run reported $0.1395525 in the prior turn; its per-run JSON was
overwritten by the later actual-plugin run. That earlier figure is conversational history, not
a retained independently inspectable artifact. The retained actual-plugin evidence reports $0.1853427.
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

Item 1 acceptance is complete. Hosted unit/graph and verified Python cost jobs passed on
[reviewer-corrected implementation 6a1cd15](https://github.com/cwijayasundara/harness_lite_for_claude_v1.0/actions/runs/34047279120).
The first hosted runs exposed missing CLI/history and a Git-metadata snapshot-copy failure;
those defects were fixed and rerun without changing test expectations or token thresholds.
The actual-plugin integration reported $0.1853427 and passed all phases. Detailed outcomes,
including incomplete attempts, are in `.aidlc/artifacts/correct-existing-mechanisms/evidence.md`.
The confirmation review of 6a1cd15 cleared the mechanism corrections and requested two
documentation fixes: cite this newer CI run and distinguish the completed review archive from
the earlier timeout. Both are now corrected against recorded evidence. No further model
approval is claimed; merge is authorized by the user's explicit instruction. Merge completion
is tracked separately from these acceptance results. Hosted model execution is an
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

### Item 2 implementation, 2026-09-06

The user's instruction to complete item 2, test, merge and push authorizes this delivery.
The ordinary spec/plan approval records are under `.aidlc/artifacts/simplify-daily-guidance/`.
Existing skills now encourage relevant system reads, consequential clarification, existing
patterns, small behavioural slices, reproduction, runtime proof and honest reporting.
Intent no longer demands an interview or invented questions, or splits an outcome on "and".
Spec includes consequential design; plan discusses alternatives only when a tradeoff exists.
Legitimate test maintenance is allowed while preserving regression proof, explicit locks and
external evaluation ownership. Material design/scope changes still return to a human.

Templates, canonical instructions, the Claude projection, review guidance and test-failure hints
are consistent with those rules. No skills, roles, hooks or control budgets were added.
Tests using generated template fixtures were updated to fill the revised prompts; their approval
state assertions and placeholder refusal checks remain intact. Full stop and commit checks and
the graph benchmark passed. The live installed-plugin smoke passed, including approval pauses, correction and independent
review. The paired guidance sample passed all boundary and product checks with zero unnecessary
questions/stops in both variants: it demonstrates no regression, not fewer workflow-repair turns.
That empirical reduction criterion remains unproven. Detailed results, original grading, incomplete
attempt and costs are recorded in `.aidlc/artifacts/simplify-daily-guidance/evidence.md`.
Full product campaigns remain item 3.

### Item 3 delivered, 2026-09-06

The existing eval runner now supports `--products`, with separate product scenarios, restricted
Docker mounts and private grading outside the agent and product processes. The driver supplies
one requirement at a time, records explicitly simulated decisions through ordinary committed
approvals, and retains every attempt with source, revisions, phase outputs and billing status.
No production controls, roles, skills or budget limits were added.

Both actual-CLI campaigns passed at `5df1a80`: five ledger changes and six service changes.
The ledger exercised characterization before implementation, rejection/correction, stale approval,
overdue-rule reversal, independent seeded-defect review and repair, storage extraction, external
rename and current documentation. The service exercised HTTP creation/validation, a missing tool,
persistence and restart, the title-limit change with old data, seeded parsing repair, and an
unwritable-storage incident leading to a new intent and HTTP 503 without state corruption.

The full run reported **2 pass, 0 fail, 0 inconclusive**, costing **USD 2.9209**. Two earlier
calibrations failed and remain in the evidence; their reported combined cost was USD 0.5774.
They exposed container Git trust/file visibility and generated-map scope handling. Deterministic
HTTP tests additionally reproduced stale Docker Desktop data reads; fresh source and data mount
identities resolve that issue. All eleven saved product revisions passed public checks and private
acceptance again with verifier `7dbdc44`, including the corrected HTTP isolation.

Seven deterministic Docker tests pass on macOS and GitHub Ubuntu: mount/write boundaries,
private-data exclusion, no-op/faulty product rejection, approval evidence, incomplete-call billing,
cleanup of timed-out public-test containers, and HTTP persistence/rule-change/storage-failure grading. Hosted unit, graph benchmark and cost
checks also passed. Credential preflight fails closed for product trials; missing billing is
unknown, and failed invocations reserve their spend allowance.

Portable results and exact evidence locations are in `.aidlc/evals/product-summary.json`.
Full private snapshots/transcripts remain in ignored `.aidlc/evals/products/`. These are one
complete run per campaign, not a reliability-rate estimate. Approvals test the scripted protocol;
deployment remains local and disposable. The separate whole-change evaluator timed out twice
(180 and 480 seconds), with no verdict or reported billing. Those reviews remain incomplete,
independently of the successful seeded product review; no whole-change evaluator approval is claimed.


Item 2 delivery: local stop/commit checks, hosted unit/graph/Python checks and the actual-plugin
smoke passed. The code change is delivered under the user's explicit merge/push authorization.
Three independent candidate-review attempts timed out; no candidate-review approval is claimed.
The paired sample found no regression but did not establish the requested friction reduction.
These limitations remain recorded rather than being reported as completed acceptance evidence.

### Item 4 implementation, 2026-09-07

The existing eval CLI now supports `--compare`: native/harness at a constant capable model,
harness with/without supplied graph context, then strong implementation versus economical
generation with strong independent evaluation. Both product campaigns use private grading and
external simulated decisions. Native has ordinary project instructions and normal shell tools
inside the same restricted Docker boundary, with no installed harness or mounted plugin.

The runner records the full schedule, first-change calibration, three paired repetitions by
default, actual model usage, tool versions, fixture/plugin identity, candidate revisions, cost,
latency, retries, approval violations and unclassified metrics. Missing billing is unknown and
reserves the invocation allowance. `--max-suite-minutes` defaults to 30; a stop file permits
gracious abandonment after the current call. The complete 48-campaign matrix is an extended
benchmark, not an automatic merge gate. Private verification/cleanup can finish after the deadline.

Graph freshness now reconciles content and paths after shell edits, deletions, renames and branch
changes. The deleted-symbol benchmark entry was repaired and golden definitions are validated.
Both graph packs and declaration-first bounded rg achieved 10/10 lookup recall: 5,743 versus
3,436 estimated tokens. This lookup sample does not establish comparative product benefit.

Live trials were stopped after the user flagged excessive runtime. The initial restricted-shell
configuration and the later natural-language approval grading failure remain in the evidence.
The final driver verifies unchanged source/approval metadata across planning instead of requiring
a particular word in the response. Failed verification candidates are saved before repair.
**Full comparative acceptance remains incomplete.** Graph/model-strategy product repetitions
are unmeasured; no winner, universal reliability or item 5 pruning is claimed.

Portable evidence is in `.aidlc/evals/comparison-summary.json`; complete private phases and source
histories remain under ignored `.aidlc/evals/comparisons/`. Total reported spend was **$7.45033505**;
one timeout omitted billing, so total cost is unknown. Reported spend plus reserved allowance
was $8.95033505. Failed, abandoned and unmeasured attempts are retained, not rounded into passes.

Targeted tests, all eleven deterministic Docker tests, the graph benchmark and full commit checks
passed. Hosted unit/graph, Docker and Python cost jobs passed at
[af5ee31](https://github.com/cwijayasundara/harness_lite_for_claude_v1.0/actions/runs/34088585911).
The final wording/deadline fixes receive separate deterministic verification; they are not claimed
as a newly completed paid campaign. Earlier approvals and the pre-existing CODEBASE-MAP.md edit
remain unchanged. Detailed delivery checks are recorded in the change's evidence artifact.


### Item 5 validated, 2026-09-07

The existing eval CLI supports `--prune`: baseline and lean disposable configurations differ only
in the automatic SessionStart budget inventory. Ledger warnings, approval context, graph and
executable controls remain identical. A single arm can be rerun with `--prune-arm`. The validated
command is `node evals/run.mjs --prune --max-suite-usd 9 --max-suite-minutes 40`; these are now the
pruning defaults. Other comparison defaults and production control limits are unchanged.

**The matched experiment is complete; retain the production baseline.** Both configurations
passed all five ledger and six service changes. Each had zero verification failures, unplanned
repair invocations and realized approval violations, with no manual product intervention.

| Full paired campaigns | Baseline | Lean |
|---|---:|---:|
| Accepted product changes | 11 / 11 | 11 / 11 |
| Reported USD | 2.6533 | 2.7860 |
| USD per accepted change | 0.2412 | 0.2533 |
| Campaign latency | 752.4 s | 844.4 s |
| Unplanned repair invocations | 0 | 0 |
| Realized approval violations | 0 | 0 |

The lean arm cost 5.0% more and took 12.2% longer in this sample. Those differences are not a
statistical reliability claim, but they do not justify adopting the simpler banner. Tool denials
also require interpretation: baseline had four denied scratch-reproduction attempts; lean had
a denied help-only `harness approve --help` request. Neither is an actual approval mutation.
Firing counts alone therefore cannot determine which controls earn their place. Unnecessary
questions remain unclassified; no causal autonomy improvement is claimed.

The fresh run passed all four calibrations and four full campaigns, reporting **USD 6.1403661**
in 30 minutes 25 seconds. Earlier attempts remain recorded: unavailable Docker, a calibration
projection above the first USD 8 cap, and a 20-minute run that completed the baseline ledger
and four service changes before an unbilled timeout. Across all attempts, reported spend is
**USD 9.92484655**, and reported plus reserved allowance is **USD 11.42484655**. Actual total
billing remains unknown because of that earlier timeout.

Validation repaired two existing evaluation problems before the fresh matched run. A correct
zero-balance description had been falsely rejected by the documentation phrase heuristic;
its failed candidate and retry cost remain saved, and a regression test protects the correction.
The saved seeded service tests also reproduced a hang after failed assertions leaked servers.
Disposable staged checks and comparison commands now use Node's 10-second test timeout. The
original fixtures, private behavioral assertions and production timeout settings are unchanged.
The original model timeout lacked a tool trace, so the reproduced hang is not claimed as its
conclusively proven cause. Both repairs apply equally to the matched arms.

All twelve deterministic Docker checks passed, including isolation, external approvals,
seeded-defect rejection, HTTP recovery and failure-with-leaked-server reporting. Full local
stop/commit results are recorded in `.aidlc/artifacts/prune-session-inventory/evidence.md`.
The user authorized merging all changes and pushing to main on 2026-09-07. Spec and plan
approvals are committed, and all final commit checks passed; earlier approvals were not rewritten.
No hosted CI or separate whole-change model review is claimed. The existing CODEBASE-MAP.md
edit is unchanged. Portable outcomes are in `.aidlc/evals/pruning-summary.json`; full phases,
product histories and the captured driver patch are in ignored `.aidlc/evals/comparisons/prune-*`.
