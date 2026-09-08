# Item 4 completion evidence

## Authorization and scope
The user requested completion of item 4, merge to main and push to GitHub on 2026-09-07.
The committed spec and plan record that conversation authorization using the ordinary approval
function. Prior approvals and production controls remain unchanged.

## First completion attempt: incomplete
Run `.aidlc/evals/comparisons/2026-09-07T14-11-18-596Z/comparison.json` used campaign driver
`5ed4fb1` with a USD 90 / 300-minute ceiling. It ended after the operator stop file was set during
diagnosis: 7 calibration passes, 6 incomplete attempts, 35 unmeasured attempts. Reported and
charged spend was USD 2.9520224. Saved terminal responses remain incomplete because their
processes timed out; they are not promoted into accepted products.

The Mac power log records repeated Idle Sleep and Maintenance Sleep during the run; the matching
local evidence is `host-sleep-events.log` in that run directory. Model-reported completion times
of 38, 132, 116, 120 and 30 seconds corresponded to parent wall times of 942, 1849, 382, 4433 and
267 seconds for timed-out calls. Sleep materially contaminated latency and process completion;
this run cannot support a comparative latency decision. The operator stopped further calls,
retaining all output, recorded billing and unmeasured schedules.

A fresh run used `caffeinate -i` (temporary idle-sleep prevention), capped at USD 87
and 300 minutes, keeping the two new attempts below the original USD 90 spend ceiling. The
invoker, campaign, product graders, fixtures and production plugin are unchanged. The driver
revision is `7ab7a38`; the later selector-input validation does not affect its default matrix.

## Focused retry support
`--compare --comparison native|graph|generation` preserves the selected pair's smoke checks,
both arms, repetitions, calibration and spend accounting. Missing, unknown and pruning-combined
selectors are rejected before model calls. The original failing regression selected all pairs;
it now passes with exactly the requested schedule. All 18 comparison tests and full commit
checks passed at `7ab7a38`. Missing-value CLI regression checks passed separately; final full
checks will follow completion evidence. No new control or production setting was added.

## Graph lookup check
Both graph packs and bounded rg attained 10/10 recall. Estimated tokens were 5743 versus 3436.
This lookup result alone does not establish graph-assisted product benefit.

## Completed native and graph comparisons
The awake run `.aidlc/evals/comparisons/2026-09-07T16-53-21-291Z/comparison.json`
finished with all twelve native and twelve graph full campaigns passing, plus all twelve
calibrations passing. It reported USD 33.6191086. Generation repetitions were explicitly
unmeasured: their conservative USD 73.8773 projection exceeded the USD 53.3809 remaining.

The generation comparisons are being scheduled as separately calibrated product batches via
`--comparison generation --id campaign-ledger` and then `--id campaign-service`. Each batch
retains three paired repetitions and its ordinary calibration refusal, alternating arm order,
private grading and model identity. No cap or guard is bypassed. Aggregate remaining spend
includes every calibration and earlier incomplete attempt. Product batching changes execution
order across products; identities and per-product paired samples remain inspectable. The ledger
batch started on 2026-09-08, capped at USD 53.38 and 125 minutes, after explicit tool approval.
The later user scope change cancelled further paid repetitions; final results follow below.

## Interrupted ledger batch and Docker recovery
The 2026-09-08T04-56-25-209Z ledger batch passed both calibrations. Its USD 34.8827
projection fit the USD 52.3626 then remaining. During the first strong-model campaign, Docker
returned `error waiting for container: unexpected EOF`; the daemon socket then disappeared.
The other five trials failed before any model call because Docker was unavailable. Raw status
labels remain retained; these are classified as infrastructure-incomplete outcomes, not model
product failures. The interrupted call has unknown billing, with its USD 1.50 allowance reserved.
Reported spend was USD 2.80379055 and charged-or-reserved spend USD 4.30379055.
Docker Desktop was started normally and its API recovered before further trials.

## Final boundary and user scope change (2026-09-08)
The ledger retry `2026-09-08T05-21-05-602Z` stopped at the operator boundary:
6 passes (2 calibrations and 4 full campaigns), 1 incomplete and 1 unmeasured.
Two ledger pairs completed; the third strong trial accepted 2/5 changes before stopping.
No full generation service campaign ran. Reported and charged retry cost: USD 20.59096775.
Across this completion request, reported spend was USD 59.9658893 and charged/reserved
spend USD 61.4658893; the interrupted Docker call retains a USD 1.50 unknown-billing reserve.
Historical attempts and costs remain separately preserved in comparison-summary.json.

Native and harness each accepted 33/33 changes over six full campaigns. Native cost USD
6.1101162 versus harness USD 7.85282515; native needed one scope repair, harness none.
Without and with graph each accepted 33/33 changes. Costs were USD 7.93572555 versus
8.47684265; without graph needed one service-startup repair, with graph none.
Neither observation establishes a universal winner or warrants promoting a more costly default.
The generation ledger retry includes one reproduced paid-description observer false block and
two genuine documentation review failures. Source fix 20f9ef3 corrects the observer; it did
not retroactively change the active process or its recorded cost/outcome.

The user explicitly redirected work to a bare-minimum app over two sprints, without the large
paid matrix. Full generation comparative acceptance remains partial, not silently completed.

## Minimal app: two local sprints
A disposable Git project was initialized through the actual harness installer at revision
20f9ef3. Sprint 1 implemented immutable task creation/listing and blank-title validation.
Sprint 2 implemented task completion, unknown-ID rejection and retained sprint 1 regression proof.
Both used separate intent/spec/plan/review folders, committed declarations and simulated approvals
through the ordinary approval CLI. These fixture approvals are not attributed to a human decision.
Draft writes, unapproved-plan writes and out-of-scope writes were rejected by the actual guard;
plan approval before spec approval was rejected by the CLI. Approved writes were allowed.
A seeded completion defect failed the stop check; restoring correct code passed. Both sprints
passed stop and commit checks. Formatting, lint, typecheck, architecture and test-quality commands
were unconfigured and explicitly skipped, not represented as passes.
No Docker or additional model invocation was used. This verifies local workflow machinery,
not independent model review or Claude Code host-hook integration. It is not a model benchmark.
Local app: `/tmp/harness-two-sprints-cp0Rz1`; executable reproduction:
`/tmp/two-sprint-smoke.mjs`; full command evidence: `/tmp/two-sprint-smoke.json`.
