# G24 on `calculator` — three pilots, 2026-09-16

`--repeats 0`: each arm runs `calc-core` once. Command:

```
node evals/run.mjs --live --compare --comparison driver --id calculator \
  --repeats 0 --boundary local --max-suite-usd 4 --max-suite-minutes 25
```

Machine: load 2.5–5.0 at each launch, Microsoft Defender at 74–114% of one core, `mds_stores` at
0% (the `.metadata_never_index` marker holds). Total spend across all three: USD 1.77.
~~No task was killed by the machine.~~ **Corrected: two were — runs 2 and 4, by the machine going
to sleep. See the correction below and F14.**

| | run 1, 08:15 | run 2, 09:22 | run 3, 10:51 | run 4, 12:38 |
|---|---|---|---|---|
| machine load at launch | 1.77 | 2.47 | 4.97 | **8.41** |
| native accepted | 1 | **incomplete** | 1 | **incomplete** |
| native USD / min | 0.121 / 0.9 | null / 7.9 | **0.138 / 0.9** | null / 6.3 |
| harness accepted | **0** | 1 | **0** | **0** |
| harness USD / min | 0.365 / 23.5 | 0.582 / 5.7 | 0.546 / 3.0 | 0.207 / 24.8 |
| the harness arm's implement turn | 87 s | 90 s | 90 s | **1484 s** |
| why the harness arm ended | `fmt` looped on CODEBASE-MAP.md | delivered | repair broke `test` | suite time exhausted inside implement |

**Run 4 measured nothing.** Cut 1 landed before it (`reviewVerdict` no longer counts a `## Blocking`
heading that says `None.` as a finding) and was never exercised: the run never reached `check-stop`.

> **CORRECTED 2026-09-16 by M1.A. The paragraph that stood here blamed machine load, and that was
> wrong.** It read the implement turn's 1484 s at "load 8.4" as a 16x slowdown against 87/90/90 s
> at load 1.8–5.0, and concluded *"quiesce below 5 and confirm it, or do not start."*
>
> The machine was asleep. `pmset -g log` puts **1402 s of that 1485 s turn inside three sleeps**
> (`Maintenance Sleep` 12:39:25 +338 s, 12:45:48 +1022 s, `Sleep Service Back to Sleep` 13:02:52) —
> **94.4% asleep**, not slow. The three "fast" runs were fast because somebody was at the keyboard:
> pmset shows `Wake … HID Activity` windows covering runs 1 and 3, and nothing covering runs 2 and 4.
> **Load and sleep are perfectly confounded across all four pilots, and no pilot measured load.**
> The load-12 ground truth cited above is a separate record and is untouched by this; what is
> withdrawn is the claim that these four pilots support a threshold of 5.
>
> The same substitution corrects runs 2 and 4's native arms, which are **not** a separate defect:
> both were killed mid-sleep, and run 4's session ends on
> `api_error` / `StreamSuspended` — *"Stream watchdog detected system suspend"* — at the exact
> second pmset records the wake. The CLI was retrying correctly; the suite's wall-clock deadline
> killed it first.
>
> **Fixed, in the runner rather than in operator discipline:** `evals/lib/awake.mjs` holds an
> idle-sleep assertion for every live run and marks any run that slept anyway. F14 below.

Raw: `.claude/harness/evals/comparisons/2026-09-16T{08-15-39,09-22-27,10-51-24}*`.

## The three criteria, measured on run 3 — the only run where both arms completed

1. **acceptance at least equal to native — NO.** 0 against 1.
2. **cost per accepted change at most native plus 10% — NO.** Ceiling 0.152. The harness arm has
   no accepted change, so the ratio is undefined; the one delivery it did make (run 2, 0.582) is
   3.8× the ceiling.
3. **at least one evaluator-caught defect per campaign that the native arm shipped — NO.** Zero.
   The evaluator did catch a real defect in runs 2 and 3, independently and identically (below),
   but it was graded `Important`, not `Blocking`, so nothing counts it; and the native arm shipped
   nothing the grader caught, so there is no defect to match it against either way.

## What the evaluator is worth, stated honestly

Twice out of two reviews it found the same real defect with no prompting:

> `expect(() => add(NaN, 1)).toThrow(/a/)` — `/a/` matches `"b must be a finite number"` via the
> article in `"a finite"`. Each assertion passes for **both** messages. Swapping the two
> `assertFiniteNumber` calls in `calc.ts` would leave the suite green.

That is weakened coverage on an approved behaviour, and no deterministic check in this harness
finds it. It is the single strongest argument for keeping the evaluator.

It is also 55% of the run: review 0.302 of 0.546 in run 3, and the repair it triggered is another
0.114. Implement alone is 0.130 — **0.94× native's whole sprint**. A driver that stopped after a
green `check-stop` would be cheaper than native and would meet criterion 2.

## The cut list, largest first

1. **Do not repair on a review with no blocking findings.** Run 3's review opens `## Blocking` with
   `None.` The driver repaired anyway, the repair anchored one assertion to the wrong argument
   (`subtract(1, '2')` names `b`, the repair asserted `/^a must be/`), `--stage stop` caught it,
   and the driver correctly refused to deliver a red build — turning a green change into no
   delivery at all. Deliver, and carry the Important finding onto the pull request. Saves 0.114 and
   converts run 3 from 0 accepted to 1.
2. **Review only what a deterministic check cannot see.** 0.302 per sprint buys one class of
   finding — weakened proof of an approved behaviour — and nothing else in three reviews. Whether
   that is worth 55% of every run is the owner's call, not a measurement's; cutting it entirely
   also makes criterion 3 unreachable by construction, which is the honest reason not to cut it
   blind.
3. **Nothing else is large.** implement 0.130, check-stop 3s, the graph never ran.

## Findings, numbered, all fixed in this session

- **F10** `fmt` failed on `CODEBASE-MAP.md`, which the harness generates. Run 1 spent USD 0.235 and
  22 minutes repairing a file it regenerates. Reproduced with no model in three steps. Fixed:
  `init` adds the four generated paths to `.prettierignore` (`bbfbdbe`).
- **F11** the model child was spawned with an open stdin pipe nobody writes to; run 2's native arm
  returned only `Warning: no stdin data received in 3s`. Fixed (`cee53d1`), and closing a pipe
  nothing writes to was right on its own terms. **Corrected by F14: the warning was not the cause
  of the 7.6 minutes that followed it.** Run 2's session log stops one second after the machine
  entered `Maintenance Sleep` at 10:22:59, and run 4 hung the same way with the pipe already
  closed. The stdin warning was a coincident symptom, not the hang.
- **F12** vitest's run cache landed in the candidate diff — the evaluator caught it. The fixture's
  `.gitignore` was Python-only. Fixed (`8608445`).
- **F13** the offline suite went flaky when the fixture gained a real toolchain: two full runs
  failed 3 then 1 tests, never the same set. The repeat offender asserts concurrency and bounded
  its rendezvous at 30 s — 20.7 s quiet, 46.7 s under load. Fixed (`8608445`).
- **F14** the host slept through live runs and the suite measured the sleep as latency. Two of the
  four pilots here were killed mid-sleep with empty transcripts, and a third of a turn recorded as
  a load slowdown was 94.4% sleep. Diagnosed from the persisted CLI sessions plus `pmset -g log`,
  with no model calls and no spend. This repository had already found and lost this once
  (`.claude/harness/artifacts/complete-native-comparisons/evidence.md:15`, remedied by an operator typing
  `caffeinate -i`). Fixed in the runner: `evals/lib/awake.mjs`, `test/host-sleep.test.mjs`.
