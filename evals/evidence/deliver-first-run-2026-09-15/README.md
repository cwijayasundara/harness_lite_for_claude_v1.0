# The first real `harness deliver --live` run, and the G24 pilot — 2026-09-15

One command, inside the operator's 30-minute bound for an integration test of the harness:

```
node evals/run.mjs --live --compare --comparison driver --id campaign-ledger --repeats 0 --boundary local --max-suite-usd 8 --max-suite-minutes 25
```

`--repeats 0` is calibration only: each arm runs campaign-ledger sprint 1 (`ledger-characterize`)
once. The harness arm's run *is* `harness deliver ledger-characterize --live`, driven by
`evals/lib/driver-campaign.mjs` from the runtime `harness init` recorded. Verdict file:
`evals/evidence/g24-driver-comparison.json`. Raw evidence (gitignored):
`.aidlc/evals/comparisons/2026-09-15T20-38-26-807Z/`; the files here are copies with transcripts
truncated to their last 3,000 characters.

Machine: load 1.77 at launch, 5.30 at the end; Docker, Cursor and Microsoft Defender were running.
No task was killed. Third attempt; the two before it are the findings below.

## Numbers

| | native | harness-driver |
|---|---|---|
| accepted changes | 1 | 1 |
| USD per accepted change | 0.1633 | 1.1401 |
| wall-clock | 1.1 min | 4.8 min |
| cache-read share | not measured by that arm | 90% |
| model turns | — | 25 |
| review rounds | 0 | 2 (first changes-requested, then approve) |
| repairs | 0 | 1 |
| evaluator-caught defects | — | 1 |
| grader-caught defects shipped | 0 | 0 |
| denied Bash commands | — | 7 |

Driver cost by phase (`driver/deliver-phases.json`): implement 0.148, refactor 0.055, review 0.286,
repair 0.185, review 0.465. The two evaluator reviews are 66% of the run.

## G24's three criteria, pilot-sized (one repetition, one sprint — not the three-repetition measurement)

1. acceptance at least equal to native — **yes** (1 = 1).
2. cost per accepted change at most native plus 10% — **no**: 1.14 against a ceiling of 0.18, 6.3× over.
3. at least one evaluator-caught defect per campaign that the native arm shipped — **no**: the
   evaluator caught one (`driver/review.md`, first round), but the grader caught nothing in the
   native arm's sprint 1, so there is no native-shipped defect to match it against.

## Findings, numbered

Each was found by running the harness, not by reading it. F1–F3 were found by the dry run; F4–F7
by the three live attempts. All are fixes to existing machinery (Law 11: no new control).

- **F1** The driver's model turns loaded no plugin: `--setting-sources project` reads the
  consumer's `enabledPlugins`, which names a marketplace install this laptop does not have. Fixed
  in 9d3a859 (`--plugin-dir` from the CLI's own root, `HARNESS_HOME` for the shim).
- **F2** The PR phase threw on a fixture with no GitHub remote, after the run was paid for. Fixed
  in 9d3a859: `pr.md` is written first, the failure is a recorded `unopened` event. Seen live:
  `driver/pr.md`, `pr_unopened: "gh pr create failed: no git remotes found"`.
- **F3** The run recorded USD and nothing else. Fixed in 9d3a859; the `deliver-run` ledger row is
  `driver/ledger-deliver-run.jsonl`, the block is `## Delivery run` in `driver/review.md`.
- **F4** Attempt 1 (21:21) refused before spending: "Container runs require
  CLAUDE_CODE_OAUTH_TOKEN". The container that rule guarded was removed by
  the-harness-needs-no-container; the rule stayed. Fixed in 4298956.
- **F5** Attempt 2 (21:22, `.aidlc/evals/comparisons/2026-09-15T20-22-04-114Z`): the arm ran the
  driver from the staged plugin *copy*; the install record named the repository runtime; all
  seven checks in the run refused on `runtime mismatch` before running a control; the driver paid
  USD 0.23 for a repair turn against an empty failure list and stopped with "still failing: ".
  The delivered code passed all 12 product tests. Fixed in 9905abf: the arm runs the recorded
  runtime, and an identity error stops the driver by name with no repair turn.
- **F6** Attempt 3 (21:30, `.aidlc/evals/comparisons/2026-09-15T20-30-10-921Z`): the driver ran all
  seven phases (USD 2.35, two repairs, approve) and the arm reported it as not delivered — it
  read the last line *starting* with `{` out of a pretty-printed envelope. Fixed in ba24099.
- **F7** Open. In every run the generator's `node --test` and `harness check` commands were denied
  (5 of 7 denials in the accepted run are in the implement turn: `driver/deliver-phases.json`,
  `denied`), because `harness init`'s settings allow only the harness's own commands and the
  driver runs under `acceptEdits`. The post-write hook ran the tests instead, so the checks were
  still green — but each denied turn is a paid turn that produced nothing.
- **F8** Open. The second review (`driver/review.md:34`) found that the first round's `review.md`
  — with its `approve` for an earlier candidate — was committed into the candidate of the
  second round, and that the repair turn had written a "Response to review" section under it.
  A review artifact inside the diff it is reviewing is a design smell the reviewer had to
  reason around; it did not change the verdict.
