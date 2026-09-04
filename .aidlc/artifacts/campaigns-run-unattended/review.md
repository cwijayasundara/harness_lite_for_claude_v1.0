---
reviewer: evaluator (claude-opus-5)
commit: eb9a947
supersedes: 1ace6a8
at: 2026-09-04
---
# Review: campaigns-run-unattended (re-review of the repair)

Scope: the repair commit `eb9a947` against the review of `1ace6a8`. This pass judges whether the
repair discharges the prior findings, and whether it introduced anything new. The parts already
cleared last time — the placement of the forced-identity branch, the staged working copy's
inability to set the variable, and the argument against a token or signed nonce — are unchanged
and are not re-litigated here.

Not re-run: `harness check --stage commit`, reported green on this commit. This review adds
nothing it already catches. What follows was verified by execution against a checkout of
`eb9a947`, including two mutations to establish that the new tests fail when the defect returns.

## Prior findings

### Blocking 1 — `AIDLC_UNATTENDED` set for all 24 eval tasks — **resolved (see Blocking 2)**

`claudeInvoker` now destructures `task` and sets the variable only under `task?.steps`. Both call
sites in `evals/run.mjs` pass it: `runAttempt` sends `task: t` on the single-prompt branch and
`task: t, step: idx` on the campaign branch. `evals/run.mjs:310` is the only production caller of
`claudeInvoker`; the remaining callers are in `test/invoker.test.mjs`, which passes no `task` and
therefore correctly gets no variable.

The new test is real, and this was the point of the finding. It puts a stub `claude` on `PATH`
that dumps its own environment, then calls the actual `claudeInvoker` — not a fake standing in for
it. Mutation check: reverting `invoker.mjs` to the unconditional
`AIDLC_UNATTENDED: '1'` fails `B4 (invoker)` and nothing else in the file. The old B7 test's fake,
which set the variable itself and claimed to do so "exactly as invoker.mjs will", is no longer the
only thing standing between this seam and a regression.

What the repair does not cover is an inherited variable, which is Blocking 2 below. The runner no
longer *introduces* the defect; it can still *pass it through*.

### Important 2 — a run that throws loses its auto-approval record — **resolved**

The catch path now pushes `unattended: unattendedApprovals(s.work)`, read before `finally` deletes
the copy. `important-2` exercises it end to end: the fake invoke runs `harness new`, commits,
approves through the real CLI with the variable set, then throws, and the test asserts both
`results[0].unattended` and `results[0].runs[0].unattended`. Mutation check: removing the field
from the catch push fails that test alone.

On the `e.fatal` re-throw path — `if (e.fatal) { s.cleanup(); throw e; }` — the record is still
lost, and I am satisfied that is correct as it stands. A fatal is a broken harness (`notInstalled`,
or an auth error matched in the transcript), and it aborts `runSuite` entirely: `main()` never
reaches `writeFileSync` and no results file is produced at all. The defect Important 2 named was a
*silently wrong* record — `unattended: []` reading as "approved nothing". The fatal path produces
no record to be wrong, and fails loudly. Different failure, already loud, out of scope. It is
worth knowing that an auth expiry at campaign step 3, after a self-approval at step 1, discards the
whole run including that approval; that is pre-existing behaviour this change does not worsen.

### Important 3 — the identity is overridden silently — **resolved**

`approve()` captures `suppliedBy` before the substitution and returns
`discardedBy = suppliedBy && suppliedBy !== by ? suppliedBy : null`. Checked against every input
shape:

- no `--by`, variable set — `suppliedBy` is `null`, `discardedBy` is `null`. Correct: nothing was
  discarded, and the campaign path prints nothing.
- `--by` given, variable unset — `by` is never reassigned, so `suppliedBy === by` and `discardedBy`
  is `null`. Correct.
- `--by cwijayasundara`, variable set — `discardedBy` is `cwijayasundara`. Correct.
- `--by unattended-eval-run`, variable set — `null`. Correct; the caller asked for what it got.

The return shape is additive and `.aidlc/bin/harness:407` is the only caller of `approve()`, so
nothing breaks. The stderr line fires before the success line on stdout, so a caller reading only
stdout still sees plain success — that is the right trade, since stderr is where a warning belongs
and the file remains the record of last resort. B2's test now asserts both `/discarded/` and
`/cwijayasundara/` on stderr.

### Nit 1 — the hard-coded artifacts path — **resolved, and better than asked**

I asked for the copy's config or a recorded assumption. `layout(work).artifacts` is stronger than
either, because `layout()` in `.aidlc/lib/paths.mjs` takes only a root and computes the rest —
`loadConfig` sets `layout: L` from the same function with no `[layout]` merge. So
`cfg.layout.artifacts` and `layout(work).artifacts` are the same expression evaluated on different
roots, and the divergence my nit imagined cannot open. The nit's premise was wrong; the fix removes
the duplication anyway.

### Nit 2 — the notice maintained twice — **resolved**

`UNATTENDED_APPROVE_NOTICE` is exported from `.aidlc/lib/artifacts.mjs` and consumed by both
`harness status` and the `SessionStart` action. Both readings are grammatical, and B1's assertions
(`/no human/i`, `/harness approve/`) still hold against the shared wording.

### Nit 3 — nothing tested the real invoker's env — **resolved**

Same test as Blocking 1, mutation-verified. This was the seam and it is now covered.

### Nit 4 — OPERATING.md claimed one reader — **resolved, with one new inaccuracy**

The paragraph now names all three read sites, and `grep` confirms there are exactly three:
`approve()`, `.aidlc/hooks/dispatch.mjs:170`, and `.aidlc/bin/harness:430`. It also documents the
discarded-`--by` warning. The count is right. A different sentence in the same paragraph is now
wrong — see Blocking 2.

## Blocking

### 2. An inherited `AIDLC_UNATTENDED` still reaches all 22 golden tasks, and the docs say it cannot — B4

`evals/lib/invoker.mjs` builds the child environment as:

```js
const env = { ...process.env, ...(pluginDir ? { HARNESS_HOME: pluginDir } : {}), ...(task?.steps ? { AIDLC_UNATTENDED: '1' } : {}) };
```

The conditional governs only what the runner *adds*. `...process.env` is spread first and nothing
removes the variable, so if the operator's own environment carries `AIDLC_UNATTENDED`, every
single-prompt task is spawned with it and Blocking 1 returns in full — the `SessionStart` hook
fires in all 24 staged copies and the eight artifact- and contract-shaped tasks, `scope-refusal`
among them, are graded against an `expected.json` calibrated without that context.

This is not hypothetical reasoning about the code. Running the unit suite with the variable
exported:

```
AIDLC_UNATTENDED=1 node --test test/autogate.test.mjs
✖ B1  ✖ B3  ✖ B4 (invoker)      3 fail
```

`B4 (invoker)`'s own assertion — "a single-prompt task must run exactly as it does for a real,
attended repository" — is false in that environment.

Two things make this blocking rather than a nit, given how much less likely it is than the
original:

1. **The diff asserts in prose that it cannot happen.** `docs/OPERATING.md` now reads: "sets
   `AIDLC_UNATTENDED` on the `claude` process it spawns for a campaign step only, never for a
   single-prompt golden task; that is the only place it is set". That is the operator's map of a
   control that stands in for a human gate, and the sentence states an absolute I can falsify in
   one command. The previous, vaguer text was less accurate and less wrong. A false guarantee in
   this paragraph is worse than no guarantee.
2. **This commit already accepts the premise.** Important 3's fix exists because the variable
   plausibly leaks into a person's environment — "exported in a shell to reproduce a campaign,
   inherited by a CI job, or held by a nested process under a campaign". The change cannot hold
   that the leak is real enough to warrant a stderr warning inside `approve()` and simultaneously
   that the same leak reaching `evals/run.mjs` needs no handling. B2 got mitigation; B4 got prose.

The mitigating facts, stated so the fix is sized correctly and not over-built: the probability is
operator-conditional, `CLAUDE.md` requires `--stage stop` before any completion claim, and that
suite fails loudly in exactly the polluted shell. The exposure is detected. It is not closed.

Required, and this is the whole of it: strip rather than merely not-add — build the base env, then
`env.AIDLC_UNATTENDED = '1'` when `task?.steps` and `delete env.AIDLC_UNATTENDED` otherwise (a
spread of `undefined` will not do it; Node stringifies it). Then extend the existing test to run
the single-prompt case with the variable present in the parent env, which is the assertion that
would have caught this. And correct the OPERATING.md sentence to describe what the code then
actually guarantees. If the human judges the inherited case genuinely out of scope, the honest
alternative is to soften that sentence — but leaving it claiming an absolute is not one of the
options.

## Nits

1. **B7, Important 2** — the catch push gained `unattended` but still omits
   `changed: changedFilesIn(s.work, s.pristine)`. The argument the repair added for `unattended`
   applies to `changed` word for word: the working copy is about to be deleted by `finally`, and
   `changed` is the field that distinguishes "did nothing" from "wrote it somewhere else" on
   precisely the run that failed. Pre-existing, and now the odd one out in a push whose comment
   explains why it reads before cleanup.
2. **B4** — the new test mutates `process.env.PATH` and restores it in `finally`. Correct as
   written, but it makes the test order-sensitive to anything running concurrently in-process;
   `node --test` runs files in separate processes today, so this is a note, not a problem.

## Examined and clear in the repair

- **The `dispatch.mjs` import direction is sound.** The concern would be a fast-path hook taking on
  load cost or a new import-time failure mode. Neither applies: `dispatch.mjs` already imports
  `./lib/guard.mjs`, and `guard.mjs` imports `governingPlans` from `../lib/artifacts.mjs`, so
  `artifacts.mjs` was in the hook's module graph before this commit. `artifacts.mjs` imports only
  `node:` builtins and declares only functions and constants — no top-level work, nothing that can
  throw at import. The new import adds a name, not a dependency, and moves the shared string to the
  side that owns `approve()`, which is where the wording's meaning lives.
- **No residue of the unwound half-repair.** `59d1ff5` is not an ancestor of `eb9a947`
  (`git merge-base --is-ancestor` returns false), and the diff `f8d95fa..eb9a947` is internally
  consistent across all seven files: the shared constant is defined and both consumers read it, the
  invoker's `task` parameter is destructured where it is used, and `discardedBy` is produced,
  returned, consumed and asserted. Nothing in the tree is half-applied.
- **Both new tests are load-bearing**, established by mutation rather than by reading them:
  reverting the invoker's conditional fails `B4 (invoker)` alone; dropping `unattended` from the
  catch push fails `important-2` alone. Neither test passes for a reason other than the behaviour
  it names.

## Verdict

**changes-requested.**

Every finding from the review of `1ace6a8` is discharged, and two of them — the invoker test and
the `layout()` fix — are better than what I asked for. The repair is well made and the reasoning in
its comments is accurate.

It returns for one clause. The scoping closed the path the runner opens and left the path the
runner inherits, and then documented the pair as closed. That second half is why this is blocking
rather than a nit: I am not asking for hardening against a hypothetical, I am asking that the
OPERATING.md sentence and the code agree, and the cheaper direction of agreement is three lines in
`invoker.mjs` plus one assertion in a test that already exists.

This is the second changes-requested on this change. If the next repair is those three lines and
that sentence, it is not a loop. If it turns into anything larger, it belongs to the human.

## Confirming pass — Blocking 2 (commits `29fdfec`, `d668876`)

Narrow re-check of the one Blocking left open by review `419c0a4`. Nothing else re-litigated.

**1. The strip is correct — confirmed by execution.** `evals/lib/invoker.mjs:42-44` now spreads
the base env, then sets or `delete`s. Driving the real `claudeInvoker` against a stub `claude`
that dumps its own env, with `AIDLC_UNATTENDED=1` exported in the parent process:

    parent= "1"
    single-prompt child: []                        <- stripped
    campaign child:      ["AIDLC_UNATTENDED=1"]    <- set
    no-task child:       []                        <- stripped

Also stripped when the parent exports it empty (`AIDLC_UNATTENDED=`), and the campaign step still
receives `1` when the parent has it unset. The scoping key is unchanged (`task?.steps`), so B4's
original distinction is intact.

**2. The test is load-bearing — confirmed by mutation.** With `else delete env.AIDLC_UNATTENDED;`
removed, `test/autogate.test.mjs` fails on exactly the intended assertion:

    ✖ B4 (invoker): ... AssertionError: inherited from the parent shell, a single-prompt task
      must still run attended
    ℹ pass 6  ℹ fail 1

Restored; 7/7 pass. The mutant is caught regardless of the operator's own shell, because the test
sets and restores `process.env.AIDLC_UNATTENDED` itself rather than depending on ambient state.
(Incidental, no action: the second mutant `env.AIDLC_UNATTENDED = undefined` also passes the
suite — Node omits `undefined` env values from the child rather than stringifying them, so the
comment at `invoker.mjs:38-40` overstates that specific hazard. `delete` is still the right call
and the behaviour is correct; only the comment's reasoning is off.)

**3. `docs/OPERATING.md` is now true.** The absolute claim "that is the only place it is set" is
gone. What replaced it (lines 88-97) states the strip and its reason, keeps the accurate claim
that no file in the staged working copy can turn the signal on, and names the residual risk in
its own sentence: *"What that does not cover is a person running `harness approve` by hand in
such a shell: the three readers below honour the variable wherever it is set, which is why a
discarded `--by` is reported to stderr."* That is the exposure the code genuinely has, stated
rather than hidden, and the stderr mitigation it leans on exists (`.aidlc/lib/artifacts.mjs:98-104`,
`discardedBy`).

**4. The attended tests are hermetic, and no assertion moved.** B1 and B3 changed only the second
argument of three calls — `process.env` -> `attended()` (`test/autogate.test.mjs:24`, a spread
with the variable deleted). Every assertion and expected value is byte-identical in the diff:
B1's `doesNotMatch(..., /unattended|AIDLC_UNATTENDED/)`, B3's `status 1` +
`/an approval needs an approver/`, `status 0` + `/^by: tester$/m`. Nothing weakened. Evidence
that this was a real falsification rather than a cosmetic change: with `AIDLC_UNATTENDED=1`
exported, the pre-repair files (`eb9a947`) fail B1, B3 and B4 (4 pass / 3 fail); the repaired
files pass all 7 under the same polluted shell.

Blocking 2: **confirmed discharged**. Nit 1 from `419c0a4` (the catch path records `unattended`
but still omits `changed`) remains open by decision, queued as its own change.

**approve**

## Note on the incidental in item 2

The comment was corrected rather than left standing. Measured directly: a child spawned with an
`undefined` env value receives no such key, so the claim that it would arrive as the string
`"undefined"` was wrong. `delete` remains correct and is kept; the comment now says why without
resting on a hazard that does not exist.
