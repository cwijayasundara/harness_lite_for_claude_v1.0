# Delivery contract: dormant-sensors-run-at-commit

- **Schema:** aidlc.contract/v1
- **Change id:** dormant-sensors-run-at-commit
- **Intent ref:** ../intent-refs/dormant-sensors-run-at-commit.json
- **Story ref:** none
- **Risk:** standard
- **Spec status:** draft
- **Spec approval digest:** pending
- **Plan status:** draft
- **Plan approval digest:** pending

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

## Approach and rejected alternatives

Add `arch` and `test_quality` to the `commit` stage in both the repository registry and the
install template, and add B1 as the general rule that keeps the next sensor from arriving dormant.

Rejected: wiring them into `drift`. `drift` is `[]` here and nobody runs it. It would stop the
audit printing "no stage runs it" while they still never ran — trading a truthful complaint for a
false clearance, which is worse than the complaint.

Rejected: deleting both, which is the audit's other offered option. `arch` is the only thing
enforcing the kernel/adapter boundary, and `test_quality` is the only thing standing between this
repository and a green report on an empty suite. Neither has been judged, because neither has run.
Deleting a control to silence a status line is the inverse of the ledger's purpose.

Rejected: asserting the two names directly in the test. It would pass forever and catch nothing
new; the third dormant sensor would arrive exactly as these two did.

Rejected: re-implementing the stage walk inside the test. Two functions answering "does a stage
run this?" is the shape of half the defects found in this repository over the past week.

Rejected: adding them to `stop` as well. `stop` runs on every agent halt; `commit` is where a
structural rule belongs, and the cheaper stage stays cheap.

## Structure and ownership

| Path | Change |
|---|---|
| `.aidlc/harness.toml` | `commit` gains `arch` and `test_quality` — the owner's edit, not the agent's |
| `.aidlc/templates/harness.toml` | same, so a generated project wires them from install |
| `test/contracts.test.mjs` | B1: every required-profile command is reachable from a stage |

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
- The known limit of B1 is written into Out of scope rather than left for someone to discover.

## Operations

1. Add B1 to `test/contracts.test.mjs`, importing `wiredControls` from `.aidlc/lib/ledger.mjs` and
   reusing the existing `harness.toml` discovery walk. Run it and record the B2 failure.
2. Add `arch` and `test_quality` to `[stages] commit` in `.aidlc/templates/harness.toml`.
3. The owner edits `.aidlc/harness.toml`: `commit = ["stop", "scope-drift", "budget", "arch", "test_quality"]`.
4. `harness check --stage commit`, recording that both sensors now appear with a verdict, and the
   elapsed time for B6.
5. `harness ledger audit`, recording that neither is reported unwired.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/contracts.test.mjs` — a required-profile command no stage reaches fails, naming file, profile and command |
| B2 | the recorded failure of B1 against the registry before step 3 |
| B3 | `test/contracts.test.mjs` imports `wiredControls`; no second stage walk exists in the suite |
| B4 | `harness check --stage commit` output naming `arch` and `test_quality` |
| B5 | `harness check --stage commit` in a template install: both `skipped`, stage passes |
| B6 | the elapsed milliseconds for both sensors in the B4 output |
