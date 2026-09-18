---
reviewer: evaluator (claude-opus-5)
commit: e5aa72c
at: 2026-09-04
---
# Review: evolving-scope

Scope of this review: B1, B2, B4, B6, B9 as proved by `test/campaign.test.mjs`, and whether the
fixtures and tasks built for B3, B5, B7, B8, B10 are *capable* of proving them. The live campaign
run is not judged here.

Verified independently: `node --test test/campaign.test.mjs` — 15 pass, 0 fail. Both campaign
fixtures staged through `evals/lib/stage.mjs` and `harness check --stage stop` run against each.

No suppression, threshold raise or ignore-comment is introduced by this diff. The one control
override in the change is at the spec level — the B6 amendment (`74cea28`) — and it is treated as
a finding below rather than as machinery.

## Blocking

### 1. Both campaign fixtures fail `harness check --stage stop` before any model runs — B3, B7

Every step of both new tasks opens with `{ "harness_stage_passes": "stop" }`. Staged and run:

- `campaign-ledger`: `FAIL fmt — npm error npx canceled due to missing packages and no YES
  option: ["prettier@3.9.6"]`, then lint/typecheck/test all SKIP. The fixture's `harness.toml`
  declares `npx --no-install prettier|eslint|tsc`, the staged tmpdir has no `node_modules`, and
  `--no-install` forbids fetching. The step-1 prompt additionally says "plain Node.js with no
  external packages", so the requirement and the capability contract contradict each other.
- `campaign-legacy`: `FAIL fmt — Would reformat: src/app/catalog.py`. The fixture is committed in a
  state ruff will not accept.

`runAttempt` breaks the step loop on the first failing assertion, so both campaigns terminate at
step 0 with verdict `fail`. `campaign-ledger` never reaches sprint 2 or 3, so B4, B5 and B6 get no
campaign evidence at all; `campaign-legacy` never reaches sprint 2, so B7's "the defect survives"
is never tested. Order step 7 ("Run both") was skipped, which is precisely why this is undetected.

Compounding: `campaign-legacy` step 1 *also* tells the agent "do not change anything this
requirement does not ask for", while `stop` cannot go green until `catalog.py` is reformatted. The
fixture forces the tidying B7 exists to detect.

Required: make both fixtures green at sprint 0 before a campaign is run, and prove it —
a staged `stop` on each is a two-line addition to `test/campaign.test.mjs` and costs nothing.

### 2. `campaign-legacy`'s deliberate defect is announced in the source, naming its own fix — B7

`evals/fixtures/campaign-legacy/src/app/fees.py`:

```
    # BUG: should be `late <= GRACE_DAYS`. As written, a book returned exactly on the last grace
    # day already starts accruing a fee — one day earlier than the docstring promises.
    if late < GRACE_DAYS:
```

Spec B7 requires a defect "no sprint asks about"; the plan's Order step 5 calls it "its one
undiscussed defect". The prompts are indeed silent, but the fixture is not: it is a standing
in-repo instruction to fix exactly this line, with the corrected expression given verbatim. The
protecting assertion is `{ "files_unchanged": ["src/app/fees.py"] }`.

The consequence is worse than a weak test. An agent that follows the comment fails the task, and
B10 records "the agent tidied on the way past" as a harness defect — when what actually happened
is that the fixture told it to. This change's sole deliverable is a defect list; a fixture that
manufactures a false entry in it is a blocking problem, not a nit.

`NOTES.md` also states "It works today; that is the whole claim", which the comment contradicts.

Required: state the behaviour in `fees.py` neutrally (or in a docstring only) so the defect is
discoverable by reading the code, not announced by it.

### 3. The campaigns run in CI on every qualifying PR, and nothing caps their cost — B9, spec `## Out of scope`

The spec's Out of scope says campaigns are not run "in CI on every push", and the new
`docs/OPERATING.md` section repeats it: "CI does not run them on every push." Both are false as
built:

- `.github/workflows/harness.yml` triggers the `evals` job on any pull request whose diff matches
  `evals/(tasks\.json|lib/|run\.mjs)`. This very change touches all three.
- That job runs `node evals/run.mjs`, which runs **every** task in `tasks.json`. There is no
  `manual`, `tags`, or exclusion field, and `--id` is a developer convenience, not a default.

B9's third clause — "the suite total respects the run cap in `.github/workflows/harness.yml`" — is
not met either. The workflow passes `--max-suite-usd 5`; `run.mjs` never reads that string
(`git grep max-suite-usd` finds it only in the workflow), and unknown argv is silently ignored. The
two new tasks add `4 × 3 + 2.5 × 2 = $17` of per-run ceiling — over three times the nominal cap —
to a job that will now fire on ordinary eval-library edits, at `timeoutMs: 900000` each.

Required: either a task-level opt-out the runner honours by default, or implement
`--max-suite-usd`. Documenting a cap that the code ignores is the failure mode `harness ledger`
exists to catch.

## Important

### 4. Amended B6 claims more than `behavioursHaveTests` checks — B6, Compliance

The direction of the amendment is right. Original B6 demanded "a test that exercises it" and in the
same breath claimed to be "checkable without a model"; those cannot both hold, and treating a
runtime-evidence row as unverifiable is supported by the plan skill independently of what had been
built. That part is a correction, not a narrowing, and I would not revert it.

Two things narrowed without being disclosed:

- The amended text reads "every row that resolves to a test names one that still exists **and
  still contains the identifier it claims**". `testRowIn` only ever populates `identifier` when the
  backtick span contains a literal `::`. By the amendment's own count, zero of this repository's
  137 Proof rows use that shape. So against every plan actually written here, the identifier clause
  is inert and only file existence is checked — a row naming a test file that exists but whose
  named test was deleted passes. The clause reads as the strong half of B6 and is the dead half.
  The `::`/no-`::` boundary is a typing accident, not a statement about what must be true.
- Original B6's second clause, "every test file traces to a behaviour", was dropped. Neither the
  amendment commit nor the spec records why. That is the orphan-test direction and it is
  mechanically checkable in principle; if it is out of scope, say so.

Required: make B6's text describe what the check does (file existence always; identifier only when
the row states one), and record the reason the reverse-direction clause was dropped.

### 5. `unverifiable` is computed and then discarded at the only seam that consumes it — B6

Amended B6 says such a row "is reported as *unverifiable*". `behavioursHaveTests` returns it;
`CHECKS.behaviours_have_tests` does `ok(r.ok === want, r.violations.join('; '))` and drops the
field. Nothing prints it, nothing reaches the results JSON, nothing will reach `evidence.md`. Given
finding 4 — where the *majority* row shape lands in `unverifiable` — B6 in a real campaign reports
neither the violations it cannot see nor the rows it declined to check. The letter of B6 is met by
`campaign.mjs`; the effect is not.

### 6. `behaviours_have_tests: true` passes vacuously — B6

`behavioursHaveTests` returns `{ok: true}` when `.aidlc/artifacts` does not exist, and skips any
spec that is not `status: approved`. `test/campaign.test.mjs` asserts both as intended behaviour.
In `campaign-legacy` step 2 this is the *final* sprint's artifact check: a run in which the agent
never got a spec approved — the exact failure B8 is hunting — passes it. `run.mjs` states the
countervailing principle in its own comments ("An empty suite is not a pass"; "an empty assertion
list is not a pass either"). This check does not follow it.

Required: the campaign assertion should distinguish "nothing to check" from "checked and clean",
and a campaign step that expects artifacts should fail when there are none.

### 7. `unseen_requirements` proves absence of two literal strings, not B2's claim — B2

B2 claims the agent "has never seen sprint N+1's requirement **in any form** — not in the fixture,
not in a README, not in a comment". `unseenRequirements` tests `content.includes(n)` for the
needles the task author duplicated by hand: `"can be partially paid"` and
`"must never appear as overdue"`.

Two gaps, in opposite directions:

- Under-claiming is silent. `recordPayment`, `isOverdue`, `partial payment`, or a paraphrase leaks
  the sprint-3 requirement without tripping either needle. Sprint 2's prompt introduces
  `test_partial_payment_reduces_balance`, so by sprint 3 the working copy is full of the concept
  the sprint-1 assertion was guarding against; only the sprint-1 assertion catches anything, and
  only for a phrase nobody would naturally write.
- Over-firing is possible. The walk covers the whole working copy including `.aidlc/artifacts/`
  the agent itself just wrote, so a sprint-1 spec that speculates "future sprints may allow partial
  payment" fails a step for good behaviour.

The plan is honest that the duplication "is the price of keeping `CHECKS` pure". The finding is not
the duplication — it is that B2's text asserts a universal ("in any form") that the check cannot
support. Either weaken B2 to what is checked, or derive the needles from the later step's prompt in
the runner rather than by hand.

### 8. Two `transcript_matches` regexes can be satisfied by echoing their own prompt — B5, B7

- `campaign-ledger` step 3: `"(?i)(supersed|contradict)"`. The prompt says "**this contradicts**
  sprint 1's implicit rule".
- `campaign-legacy` step 1: `"(?i)characteris"`. The prompt says "**Characterise** the existing
  behaviour".

`invoker.mjs` builds the transcript from `parsed.result` plus the serialised payload, so any final
message that restates the instruction satisfies both. This is the failure `tasks.json`'s own
`$rule2` records from the other side: the regex is grading vocabulary, not engagement. It matters
most for B5, where this regex is the *only* mechanical evidence that the contradiction was surfaced
rather than absorbed — "silence fails", per the spec, but so should an echo.

The `$rule` audit itself passes: I checked all five new steps by hand against "at least one
assertion a model doing nothing would fail". Ledger 1 (`file_exists` spec, two `file_matches` on
test names), ledger 2 (`file_matches test_partial_payment_reduces_balance`), ledger 3
(`file_matches src/ledger.mjs isOverdue`), legacy 1 (`file_matches "def renew_loan"`), legacy 2
(`file_matches "def member_report"`) each carry one. Note that `modified_not_replaced` and
`behaviours_have_tests` are both do-nothing-passing and are correctly not relied on alone.

### 9. `TEST_FILE` misses common conventions, and a miss is invisible — B6

The regex accepts `test_*.{mjs,cjs,js,ts,tsx,py,go,rb,java}`, `*.test.{mjs,cjs,js,ts,tsx}` and
`*_test.{py,go,rb}`. It does not accept `*.spec.ts` / `*.spec.js` (the other dominant JS
convention), `*_test.mjs` / `*_test.ts`, `*.test.py`, `*_spec.rb` (rspec), `*Test.java`,
`*Tests.cs`, `conftest.py`, or any directory-based convention (`__tests__/foo.mjs`,
`tests/ledger.mjs`). It is documented as "deliberately narrow", which is defensible — but per
finding 5 a miss returns `unverifiable`, and `unverifiable` is discarded, so a plan proving a
behaviour with `src/ledger.spec.ts` is silently ungraded rather than reported as unchecked. Narrow
plus invisible is the combination to fix; narrow plus reported would be fine.

## Nits (4)

1. `campaign-ledger` is called "an empty repository" in B3 and in the plan, but `stage()` overlays
   `_base` first: the staged copy ships `pyproject.toml` and `src/app/__init__.py` under a
   `harness.toml` that declares Node and TypeScript. Confirmed by staging it.
2. `evals/lib/campaign.mjs` duplicates `walk` and `IGNORE` from `evals/lib/assertions.mjs`, with
   the two `IGNORE` patterns now differing (`campaign.mjs` adds `node_modules`). One exported
   helper would keep them from drifting further.
3. `unseenRequirements` reads every file in the working copy as UTF-8, binaries included. Harmless
   today, unbounded in a repository that acquires an image or a build artefact.
4. `NOTES.md` says of `campaign-legacy` "It works today; that is the whole claim", which
   `fees.py`'s own `# BUG:` comment contradicts. Whatever is done about finding 2, these two should
   agree.

## Coverage — what this review did not reach

- I did not run the full unit suite or `--stage commit` myself; I accept the report that all seven
  checks are green and have said nothing about what they cover.
- I read `campaign-legacy`'s `catalog.py`, `fees.py`, `NOTES.md` and `tests/test_smoke.py` in full;
  I did not read `models.py` or `reports.py`, so I have no view on whether the fixture's remaining
  ~120 lines conceal a second defect or a second announcement of the first.
- I did not evaluate whether the sprint prompts elicit good design, which the spec places out of
  scope.

## Verdict

Findings 1 and 3 mean the campaigns as committed cannot produce the evidence this change exists to
produce: both terminate on their first assertion, and the run that does happen happens in CI,
uncapped, on a trigger the documentation says will not fire. Finding 2 means that if 1 is fixed,
the first entry in `evidence.md` is likely to be an artefact of the fixture rather than a defect in
the harness. The B6 amendment is defensible and I would keep it; its text needs to match its
implementation.

The unit-tested half — B1, B2, B4, B9 as pure functions and as `runSuite` behaviour — is sound.
Fifteen tests pass, the negative cases are real negative cases, and the step-gating and
budget-exhaustion tests exercise a runner path that had never been executed. That work stands.

changes-requested
