---
status: draft
migrated_from: sha256:bd494acf1128a8e1bd0aa7d57719bc3554d5c89b2198e0b8fe49cbe6836d4039
---
# Spec: dormant-sensors-run-at-commit

## Outcome

The two sensors the gauntlet requires run on every commit, and a third one cannot be added
dormant without the suite saying so.

## Observable behaviours

### B1

Given any `harness.toml` that declares `[sensors] required_profiles`,
When the unit suite runs,
Then every command those profiles name must be reachable from a stage, and the test fails naming
the file, the profile and the command when it is not. Discovered, not listed: a test that checks
only the files someone remembered to list is the defect it is meant to catch.

### B2

Given `.aidlc/harness.toml` today,
When B1 runs,
Then it fails on `arch` and `test_quality`. The gap is stated as a test before it is closed, so it
cannot silently reopen.

### B3

Given the reachability question,
When the test asks it,
Then it asks it through `wiredControls` from `.aidlc/lib/ledger.mjs` — the same function
`ledger audit` uses. One definition of "a stage runs this", so the suite and the audit cannot
disagree about which sensors are wired.

### B4

Given `harness check --stage commit` in this repository after the registry is edited,
When it runs,
Then `arch` and `test_quality` each appear in the output with a verdict, and the stage passes.

### B5

Given a project generated from `.aidlc/templates/harness.toml`, where both verbs ship empty,
When `harness check --stage commit` runs there,
Then both report `skipped` and the stage passes. An empty verb is skipped, never failed, so a
generated project gains two named slots and no new way to fail.

### B6

Given the added verbs,
When the commit stage runs,
Then it is not materially slower: both sensors together are under a tenth of a second against a
stage that takes nine seconds.

### B7

Given `evals/fixtures/_base`, which exists to be governed exactly as an install is,
When the template's commit stage changes,
Then the fixture's commit stage changes with it, and `test/evals.test.mjs` fails until it does —
"or the suite grades a harness nobody runs". This behaviour is here because the first plan for this
change did not have it: ownership was listed by hand while the coupling was enforced by a test, and
the test found the omission. The rework is recorded rather than hidden.

## Out of scope

Strengthening `test-quality.mjs`. It counts `test(` calls, which catches an emptied suite and
nothing subtler; the honest version is mutation testing and it is not zero-dependency. Recorded as
the intent's open question, and the ledger can now report on the weak version.

`plan-drift`, the third name on the audit's `decide` list. It has no implementation at all, so
wiring it into a stage is not the same act — that is a deletion decision, not a wiring one.

The stage-that-nobody-runs hole. B1 asks whether a command is reachable from *a* stage, and
`drift` is a stage: wiring a sensor there would satisfy B1 while never running it. Named here
rather than fixed because the failure it produces is visible — the audit holds such a control at
`insufficient-data`, "wait — 50 invocations needed", forever, which is the exact symptom the
comment above `wiredControls` already describes. Closing it means teaching the audit that a stage
with no invocations is not a stage that runs, and that is its own change.

## Safeguards

- B2 pins the current gap as a failing test before the fix, so the fix is proved rather than
  assumed.
- B3 keeps one definition of reachability, so the suite cannot certify a wiring the audit calls
  unwired, or the reverse.
- B1 is discovered rather than enumerated, so it covers the registry, the template, and anything
  added later.
- The template's verbs stay empty, so no generated project acquires a failure it did not have.
- The write guard on `.aidlc/harness.toml` is untouched. The agent prepares; the owner commits the
  registry line. That separation is the point of the guard, and this change respects it while
  changing the file it protects.
- The fixture tracks the template by test, not by memory. B7 exists because a hand-written
  ownership table missed a coupling that a test already enforced; the table is now the weaker of
  the two records, which is the right way round.
- The known limit of B1 is written into Out of scope rather than left for someone to discover.

## Entities and existing context

- `[sensors]` (`.aidlc/harness.toml`) — `architecture = ["arch"]`, `qa = ["test_quality"]`, both
  named in `required_profiles`. `harness gauntlet` fails closed without them; nothing runs the
  gauntlet per commit.
- `[stages] commit` — `["stop", "scope-drift", "budget"]`. `stop` reaches `fast` -> `secrets`, and
  `test`. Neither sensor is reachable from any stage; `drift` is `[]`.
- `wiredControls(cfg)` (`.aidlc/lib/ledger.mjs`) — walks `[stages]`, one level of indirection to a
  depth of eight, seeded with the three hook-bound controls. Already the authority on
  reachability for `ledger audit`.
- `.aidlc/sensors/architecture.mjs` — exits 1 when a file under `.aidlc/lib`, `checks` or `hooks`
  imports `adapters/`. Measured at 0.03s, exit 0.
- `.aidlc/sensors/test-quality.mjs` — exits 1 when `test/` holds no `.test.mjs` or no `test(`
  call. Measured at 0.02s, exit 0. Measured defect it prevents: a `.test.mjs` containing an import
  and zero `test()` calls makes `node --test` print `# pass 1` and exit 0.
- `test/contracts.test.mjs` — already discovers every `harness.toml` by walking the tree and
  asserts every stage entry resolves. B1 is the mirror of that test: the first asks whether every
  named thing runs, the second asks whether everything that must run is named.
- Empty capability verbs are reported `skipped`, never `failed`. That is what makes the template
  edit safe for projects that have not filled the slots in.
- `.aidlc/harness.toml` is a prompt-prefix path. The write guard refuses the agent. That one line
  is the owner's, and this contract does not propose an exception to land itself.
