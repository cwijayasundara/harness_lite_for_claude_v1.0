# Defect repair plan

Three defects, each its own change. Written 2026-09-10 so that a fresh session can pick any one
of them up without re-deriving the evidence. Nothing here is a redesign: every item is a control
that does not do what it says, and the repair is to make it do that.

Source: [the lean-harness research proposal](LEAN-HARNESS-RESEARCH-PROPOSAL.md) and
[its backlog](LEAN-HARNESS-IMPLEMENTATION-BACKLOG.md), items F04 and F18. D1 below is not in
either document; it was found on 2026-09-10 while writing this file, by this file being written.

## How to use this

Take one item. Run `harness new <slug>`, write its intent from the section here, write the spec,
and stop for gate 1. The evidence in each section is reproducible with the commands given, so
re-verify rather than trusting the numbers: they were measured on one machine on one day.

Do not combine two of these into one change. They touch different files, they fail for different
reasons, and D1 changes what the other two are allowed to do while they are being built.

## Repository state at the time of writing

Branch `a-run-spends-only-when-asked` is complete and awaiting merge: backlog F01, the
subscription-only billing fix, taken through the full artifact chain with both gates approved.
Its commit stage is green. It is not merged, so `main` does not yet have it.

The two research documents are committed at `9ee37dc` and are the bound source for that change.

## D1 — a shell redirect is a write, and the contract guard does not think so

Suggested slug: `a-shell-redirect-is-a-write`.

**The defect.** `.aidlc/lib/guard.mjs` answers "may this file change?" twice, and the two answers
disagree. `writeRefusal`, which the Write and Edit tools go through, tests the target against the
selected change's `## Files` with `matchesDeclared`. `bashContractBlocked`, which shell commands
go through, does not test the target at all:

```js
const scope = contractScopeState(cfg);
if (!scope.parseError && scope.declared.length) return null;   // guard.mjs:220
return contractRefusal(targets[0], scope);
```

It extracts the redirect targets correctly and then discards them. Any selected change with a
non-empty `## Files` makes every path in the repository writable through a shell redirect.

**Evidence.** With `a-run-spends-only-when-asked` selected, whose plan names fifteen paths:

| Target | Through Bash | Through Write/Edit |
|---|---|---|
| `.aidlc/lib/graph.mjs` | allowed | refused |
| `test/guard.test.mjs` | allowed | refused |
| `evals/fixtures/clean-app/src/app/text.py` | allowed by this rule | refused |
| `docs/DEFECT-REPAIR-PLAN.md` | allowed | refused |
| `evals/run.mjs` (owned) | allowed | allowed |

This file exists because of the third row. It was written with a heredoc redirect to a path no
approved plan names, and the guard permitted it.

Two other bash rules are unaffected and still fire: `bashTouchesProtected` covers
`[guard].protected_paths`, and the prompt-prefix rule covers instruction and settings files. So
fixtures and `CLAUDE.md` are still defended, by different rules. Everything else is not.

**Why it matters.** `CLAUDE.md` states that `## Files` is the only declaration of ownership and
that the write guard reads it and nothing else. That is true of one of the two ways an agent
writes files. The scope-drift control still catches an unowned change at commit time, so this is
a hole in prevention, not in detection — but the whole point of a pre-write guard is that the
agent is told before it does the work, not after.

**The repair.** Make `bashContractBlocked` ask `writeRefusal` about each target, so the two paths
cannot answer differently again. The existing carve-outs must survive: `artifactOrState` keeps
heredocs writing intents and plans working, `/dev/` targets stay ignored, and quoted-then-empty
targets stay dropped.

**What will go wrong.** This rule's failure mode is false blocks, and the module documents three
it has already caused: `echo hi 2>/dev/null`, `harness check --stage stop 2>&1 | tail`, and any
commit whose message carries a `Co-Authored-By: ... <noreply@...>` trailer. `writeTargets` is
regex-level by the tree-sitter decision in `docs/BUILD-PLAN.md` Phase 3, and tightening what
happens to a target must not widen what counts as one. `test/guard.test.mjs` holds those cases;
they must stay green.

Expect the repaired guard to refuse commands that work today, including the one that created this
file. That is the change, not a side effect of it.

**Acceptance.** A table-driven test asserting that for the same target the Bash path and the
Write/Edit path return the same verdict, across owned, unowned, protected, artifact and `/dev/`
targets. The three historical false blocks stay allowed. Scope-drift keeps failing an unowned
committed change, so detection is not traded for prevention.

## D2 — the commit check runs the whole test suite twice

Suggested slug: `a-check-runs-the-suite-once`. Backlog F04.

**The defect.** `[stages]` in `.aidlc/harness.toml` defines
`commit = ["stop", "scope-drift", "budget", "tamper", "arch", "test_quality", "baseline"]`, so
`stop` — which is `secrets` plus the full `node --test` suite — has already run by the time
`baseline` starts. `.aidlc/checks/baseline.mjs` then calls `baseline.capture(cfg)`, and
`capture()` runs it again:

```js
const report = await check(cfg, { stage: 'stop', files: [], write: false, all: true });
```

**Evidence.** Measured on this branch, commit stage green:

| Control | Elapsed |
|---|---|
| `test` | 65,325 ms |
| `baseline` | 106,574 ms |

The baseline control contains a second full run of the suite. Roughly 65 seconds of every commit
check is spent recomputing a result the same process already has. It also emits no progress while
it does so, which is why it reads as a hang.

**The repair.** Give controls access to the results gathered so far in the same run, and have the
baseline control reuse the `stop` verbs from those instead of re-running them. `runOne` calls
`mod.run(cfg, files)`; a third argument carrying the in-flight results is enough. `capture()`
takes an optional precomputed stop report and keeps its own `check()` call for the standalone
`harness baseline capture` and `harness baseline check` paths, which have no run to borrow from.

**Why reuse is sound exactly where it is used.** `capture()` passes `all: true` so that fail-fast
cannot truncate the measurement. Inside a commit run the baseline control is only reached when
every earlier verb passed, so nothing was truncated and the two are equivalent. If an earlier verb
had failed, fail-fast would have stopped the run before baseline. The metric is defined for a green
stage and this is the green-stage case.

**What will go wrong.** `check_stop_tokens` is the token estimate of `render(report)`. If the
report reconstructed from in-flight results renders even slightly differently — a candidate line,
an identity line, ordering — the number moves and the ratchet fires against the recorded baseline.
Compare the two renderings byte for byte on a green tree before touching anything else. If they
must differ, re-capture the baseline and write down why. Do not widen the tolerance; it is 1.10 and
`the-gate-grades-what-it-can-measure` already had this argument.

**Acceptance.** A fixture whose configured `test` command increments a counter proves the suite
runs once for one `harness check --stage commit`. Before-and-after elapsed time on the same local
workload, pasted. A failing suite still fails the commit stage. `harness baseline check` standalone
still runs its own stop stage. No model call anywhere in this item.

## D3 — the unit and integration tests require Docker

Suggested slug: `the-tests-run-without-docker`. Backlog F18.

**The defect.** Eleven tests in `test/product-trials.test.mjs` are gated on
`process.env.HARNESS_PRODUCT_DOCKER !== '1'` and do not run in the ordinary suite. On a machine
without Docker they are skipped, and a skip is not coverage. CI builds `evals/Dockerfile` to get
them. The user's constraint is that unit and integration tests must not depend on Docker.

**The part that is easy, and the part that is not.** The eleven tests are not one kind of test:

*Behavioural, and portable to native execution.* Private ledger acceptance rejecting no-op and
faulty products; the deterministic campaign preserving failed evidence and external approvals;
incomplete calls retaining evidence; private HTTP acceptance across persistence, rule changes and
storage failure; comparison campaigns grading both arms and detecting unapproved writes;
unparseable review being incomplete; self-approval detection; leaked servers returning findings
before the deadline. These need a working directory, a Node child process and an ephemeral port.
They do not need a container; they use one because `stage()` provides one.

*Assertions about operating-system isolation, which are not portable.* Three tests assert that
`fs.readFileSync` **throws** — for the private grading file, for `evals/products.json`, for
`/plugin/evals/tasks.json`, for `/var/run/docker.sock` — and one asserts a timed-out run removes
its container rather than just the client. A child process running as the same user can read those
files. There is no honest native equivalent.

**The repair.** Add a native execution mode to `evals/lib/stage.mjs`: temporary directories, Node
child processes, port 0 with the assigned port passed through, and teardown that runs on success,
failure and timeout. Move the eight behavioural tests onto it so they become ordinary ungated
tests. Keep the three isolation tests as an explicitly opt-in container suite, named as such, and
do not count them as ordinary integration coverage. Alternatively re-scope them to assert what
native execution genuinely provides — that the private grading files are outside the tree the child
is given — but never describe that as isolation. A directory is not a sandbox.

**The constraint that must not be broken.** `evals/lib/stage.mjs` is shared with the live invoker.
Live product trials run a real coding agent with Write, Edit and Bash, and the container is that
agent's security boundary, not a test fixture. Native mode is for tests driven by a fake invoker.
Removing a test dependency must not remove an agent's sandbox. Keep the two paths visibly distinct
and assert which one a live trial takes.

**Acceptance.** On a machine with no Docker executable and no daemon, every required unit and
integration test runs and passes, including the eight moved ones. CI neither installs Docker nor
builds an image for those suites. Concurrent test files use isolated directories and ports.
Timeouts and failures leave no orphaned child processes. Any remaining container test is a
separate opt-in suite that reports honestly when it is not run. No model calls, no credentials.

## Suggested order

D1, then D2, then D3.

D1 first because the other two will be built under the boundary it restores, and because it is the
smallest of the three in code. D2 second because it is close to trivial and returns roughly a
minute to every verification run after it, including every run during D3. D3 last because it is the
largest and the only one that needs a design decision from a human, about what happens to the three
isolation assertions.

If nobody else is working in this repository through an agent, doing D2 first is defensible for
the compounding time saving. The order above is the one to take otherwise.

## What is deliberately not here

The backlog's other items are redesigns, not defects, and none of them should be started from this
document. The status overlap noise, the artifact history in every session, and the graph and
coordination modules that no failing eval justifies are all real findings, but removing them is a
subtraction decision that needs its own intent and its own gate.

The completion records for F04 and F18 belong in
[the backlog](LEAN-HARNESS-IMPLEMENTATION-BACKLOG.md), which no current plan owns. Whichever change
lands first should name that file in its `## Files` so the record can be written where it belongs.
