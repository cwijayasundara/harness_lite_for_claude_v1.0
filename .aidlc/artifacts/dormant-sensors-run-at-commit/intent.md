---
status: draft
migrated_from: aidlc.contract/v1
---
# Intent: dormant-sensors-run-at-commit

- **Date:** 2026-09-03
- **Opened at:** 2026-09-03T07:59:57.255Z
- **Author:** cwijayasundara
- **Status:** approved
- **Source:** conversation — the ledger's `decide` list

## Problem

Two sensors are declared and never run.

```
arch           1 inv   0.0% fired  decide — no stage runs it
test_quality   1 inv   0.0% fired  decide — no stage runs it
```

That single invocation each is me running them by hand to see whether they still work. No stage
lists them, so `harness check` never invokes them, so the ledger has nothing to judge. The audit
says as much in plain words and then, because it cannot distinguish silence from health, files
them next to `budget` — a control that has genuinely run 78 times and genuinely never fired.

Those are two different states and the report gives them one shelf. This is the same disease this
repository has been treating all week: a measurement that reports a number nobody can act on.

The commands are real and cheap. Both exit 0 today, in 0.03s and 0.02s:

- `.aidlc/sensors/architecture.mjs` — kernel code (`.aidlc/lib`, `checks`, `hooks`) may never
  import a provider projection under `adapters/`. It is the one structural rule that keeps the
  kernel neutral, and nothing else enforces it.
- `.aidlc/sensors/test-quality.mjs` — fails when `test/` holds no executable test. Measured just
  now: a `.test.mjs` file containing an import and zero `test()` calls makes `node --test` print
  `# pass 1` and exit 0. A suite emptied by a refactor reports green. That is commit `6496934`,
  "An empty suite is not a pass", and the guard against it is currently switched off.

`[sensors] required_profiles` already names `architecture = ["arch"]` and `qa = ["test_quality"]`,
so `harness gauntlet` fails closed without them. The gauntlet is a release-grade command nobody
runs per commit. Between commits, the rules are unenforced.

## Proposed outcome

`arch` and `test_quality` run on every `harness check --stage commit`, in this repository and in
any project generated from the template. The ledger can then say whether they earn their place on
their own evidence, and the two invariants are enforced at the moment code changes rather than at
release.

## Affected users and systems

`.aidlc/harness.toml` (this repository's registry), `.aidlc/templates/harness.toml` (every future
install), and the stage-parity test.

## Constraints

The stage must be `commit`, not `drift`. `drift` is empty here and nobody runs it; adding them
there would stop the audit printing "no stage runs it" while they still never run — trading a
truthful complaint for a false clearance, which is worse than the complaint.

`.aidlc/harness.toml` is a prompt-prefix path. The agent cannot write it. That edit is the
owner's, by design, and this intent does not propose weakening the guard to land itself.

Adding two verbs to `commit` must not slow it materially. Measured: 0.05s against a 9.6s stage.

In the template both verbs ship empty, and an empty verb is reported "skipped", never "failed".
A generated project therefore gains two named slots and no new way to fail — the same contract
`fmt`, `lint` and `coverage` already have there.

## Open questions

Whether `test-quality.mjs`'s check is strong enough to keep once it has run fifty times. Counting
`test(` calls catches an emptied suite and nothing subtler; a suite of assertion-free tests still
passes it. Mutation testing is the honest version and is not zero-dependency. Left as is, with the
ledger now able to report on it.
