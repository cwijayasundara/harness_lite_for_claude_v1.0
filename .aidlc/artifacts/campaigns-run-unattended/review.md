---
reviewer: evaluator (claude-opus-5)
commit: 1ace6a8
at: 2026-09-04
---
# Review: campaigns-run-unattended

Scope: commits `2b9e3c9` and `1ace6a8` across `.aidlc/lib/artifacts.mjs`, `.aidlc/bin/harness`,
`.aidlc/hooks/dispatch.mjs`, `evals/lib/invoker.mjs`, `evals/run.mjs`, `test/autogate.test.mjs`
and `docs/OPERATING.md`, against the approved spec.

The one control override in this diff is the whole of it: `approve()` now substitutes for a human
at both gates when an environment variable is set. Every finding below is about the blast radius
of that switch rather than about the switch itself, which is well built.

Not re-run here: `harness check --stage commit`, reported green on this commit. This review adds
nothing it already catches.

## Blocking

### 1. `AIDLC_UNATTENDED` is set for all 24 eval tasks, not the 2 campaigns — B4

`evals/lib/invoker.mjs` sets the variable unconditionally:

```js
const env = { ...process.env, ...(pluginDir ? { HARNESS_HOME: pluginDir } : {}), AIDLC_UNATTENDED: '1' };
```

`claudeInvoker` returns `invoke({ prompt, cwd, timeoutMs, budgetUsd })` — it does not destructure
`task` or `step`, although `evals/run.mjs` passes both (`invoke({ ..., task: t })` for a single
prompt, `invoke({ ..., task: t, step: idx })` for a campaign step). Nothing distinguishes a
campaign from a golden task at the point the variable is set.

The notice therefore reaches every task. `evals/lib/stage.mjs` runs `harness init --into work` for
every fixture; `init` writes `.claude/settings.json` from `projectSettings()`, which renders the
`session-start` binding in `.aidlc/hooks/policy.json`. So all 24 staged copies fire the hook, and
all 24 now receive two lines the golden suite has never been graded with:

- `unattended: this run has no human — approve your own gates with ...`
- `new change: harness new <slug> ... never write an artifact anywhere else`

B4 says: "Given the 22 single-prompt golden tasks ... their behaviour is unchanged. None of them
reaches a gate today, and **none of them may start**." This change does not merely risk one
starting — it instructs all 22 that they may. Eight are artifact- or contract-shaped
(`contract-owned-scope`, `contract-alignment`, `contract-scope-honesty`, `contract-is-testable`,
`contract-names-owned-files`, `successor-contract-links-first`, `scope-refusal`,
`intent-not-solution`). `scope-refusal` grades whether the agent refuses and says so; it now runs
with injected context telling it that it approves its own gates. That is a counter-instruction
pointed at the exact behaviour being measured, and `harness evals gate` grades the result against
an `evals/expected.json` calibrated without it.

The suite could not have caught this. B4's proof is "the existing tests pass unchanged", and none
of `test/lifecycle-cli.test.mjs`, `test/guard.test.mjs` or `test/scope-drift.test.mjs` runs a model
or touches `claudeInvoker`. The change is invisible to `--stage stop` and `--stage commit` by
construction, which is why it needs saying here.

Required: scope the variable to campaign steps. `task` is already in the argument object, so this
is `invoke({ prompt, cwd, timeoutMs, budgetUsd, task })` and setting `AIDLC_UNATTENDED` only when
`task?.steps` is present, with a test asserting a single-prompt task's spawn env does not carry it.
If suite-wide is genuinely intended, that is an amendment to B4 and belongs to the human, together
with a recalibration of `expected.json` — it is not a detail to settle in the invoker.

## Important

### 2. A run that throws loses its auto-approval record — B7, Bugs

In `evals/run.mjs` the success path records the list:

```js
changed: changedFilesIn(s.work, s.pristine),
unattended: unattendedApprovals(s.work),
```

The catch path does not:

```js
} catch (e) {
  if (e.fatal) { s.cleanup(); throw e; }
  runs.push({ attempt: i + 1, pass: false, assertions: [{ name: 'harness', pass: false, detail: e.message }], usage: {} });
} finally { if (!s.cleaned) s.cleanup(); }
```

A campaign that approves its own gates in sprint 1 and then throws in sprint 3 has its working copy
deleted by the `finally` with no record of the approval anywhere. That is precisely the case B7
exists for: "the auto-approvals are visible there, not only in the staged copy that is about to be
deleted." The aggregate's `r.unattended ?? []` keeps this from crashing, so it fails silently and
reports `unattended: []` — indistinguishable from a run that approved nothing.

This is not a corner case for campaigns specifically. `evolving-scope`'s own review records both
campaigns terminating at step 0; the failing run is the normal one so far, and it is the run whose
approvals go unrecorded.

Fix: compute the list once before the `finally` and attach it to both pushes.

### 3. The identity is overridden silently — B2, Security

`approve()` replaces `by` with no signal, and the CLI prints only success:

```js
console.log(`${kind} approved  ${result.digest}\n${path.relative(cfg.layout.root, result.file)}\ncommit this approval before continuing`);
```

A person who runs `harness approve <slug> spec --by cwijayasundara` with the variable leaked into
their environment — exported in a shell to reproduce a campaign, inherited by a CI job, or held by
a nested process under a campaign — is told the approval succeeded and never told their identity
was discarded. B2's rationale is that a campaign result must never read as evidence that someone
looked; a person's real approval recorded as a machine's is the same defect facing the other way,
and it is the shape the leak actually takes.

The plan's rejection of a token or signed nonce is sound and I am not asking for one. An agent with
Bash can set any variable inside its own process, and a real repository has no runner to set a
token at all, so the token defeats nothing the plain variable does not — the reasoning holds.

But the stated mitigation is that "the approval is stamped and visible", and today it is visible
only in the file, after the fact. It is not visible at the moment of substitution, to the one person
in a position to notice something is wrong. A single line to stderr when the identity is forced —
naming the discarded `--by` — costs nothing and is the difference between a residual risk that is
documented and one that is mitigated.

## Nits

1. **B7** — `unattendedApprovals` hard-codes `path.join(work, '.aidlc', 'artifacts')` while
   `approve()` writes to `cfg.layout.artifacts`. No fixture overrides `[layout]` today, so it is
   correct now and returns `[]` silently the day one does. Read the copy's config, or record the
   assumption in the comment.
2. **B1** — the notice is now maintained twice, in `.aidlc/bin/harness` and
   `.aidlc/hooks/dispatch.mjs`, already with different wording ("the identity is forced to
   unattended-eval-run regardless" against "the identity is forced regardless"). Keeping the
   `status` line is the right call — F6 showed it insufficient, not wrong, and it is free — but two
   hand-copied versions of one instruction drift. One exported constant.
3. **B4** — the B7 test's fake invoker sets `AIDLC_UNATTENDED` itself and comments that it does so
   "exactly as `evals/lib/invoker.mjs` will in a real run once it sets the same variable". Nothing
   tests the real invoker's env. That comment marks the exact seam Blocking 1 slipped through.
4. **B3** — `docs/OPERATING.md` says "`approve()` reads it and nothing else". True of `approve()`,
   but the variable is read in three places now: `approve()`, the `session-start` action, and
   `harness status`. This paragraph is the operator's map of a control that stands in for a human
   gate; it should name all three.

## Examined and clear

- **The placement of the forced-identity branch is right.** It sits after the `GATED.includes(kind)`
  throw and before `if (!by)`, and every remaining precondition — existence, plan-after-spec,
  `stale-approval`, `isCommitted`, `bodyDigest` — runs after it and unchanged. No caller can reach
  `approve()` with a different identity while the variable is set: `by` is a local parameter
  overwritten before first use, and the single CLI path passes `{ by: typeof by === 'string' ? by : null }`.
  B5's test exercises all four preconditions with the variable set. This is B2 and B5 correctly met.
- **Nothing inside a staged working copy can set the variable.** `stage()` copies files and runs
  `git`; it sources no shell profile, and the spawn env is assembled by the runner from
  `process.env`. B3's test plants the `[unattended] enabled = true` switch in `harness.toml` — the
  literal shape of `evidence.md` F2 — and shows it changes nothing in either direction. This is the
  strongest part of the change.
- **The `process.env` spread in the invoker.** For the previously-falsy `pluginDir` caller, a spread
  is an own-enumerable string copy of the same values, so nothing observable changes on POSIX beyond
  the added variable. (Windows loses case-insensitive lookup; the runner shells out to `git`,
  `claude` and POSIX paths throughout, so this is not live.) The behaviour change for existing
  callers is Blocking 1, not the spread.
- `readdirSync` was dropped from the plain `node:fs` import; the file uses only the `_rd` alias,
  including in the new function. No dangling reference.

## Verdict

**changes-requested.**

Blocking 1 is the one that must move before this merges: the change is scoped to campaigns in the
spec and to the whole suite in the code, and the difference is the golden suite's calibration.
Important 2 and 3 are each a few lines and both restore a property the spec already claims — B7's
visibility on the failing path, and B2's stamp being loud at the moment it is applied rather than
only in the file afterwards.

B6 is not in question. Sprint 3 executed, and `evidence.md` records it.
