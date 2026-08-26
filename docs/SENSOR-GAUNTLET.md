# Sensor gauntlet

Phase 4 adds a release-grade decision over the existing capability runner. It does not add a
language toolchain to the harness. Each product supplies commands in `.aidlc/harness.toml`; the
kernel runs them, normalizes their evidence, records their latency, and fails closed when a
required quality owner is unavailable.

| Profile | Owns | Typical project commands |
|---|---|---|
| `behaviour` | observable correctness and runtime verification | pytest, Vitest, Maven test |
| `architecture` | dependency and structural boundaries | ArchUnit, dependency-cruiser, import-linter |
| `hardening` | credentials and dependency/security defects | built-in secrets, gitleaks, dependency audit |
| `qa` | test integrity and static fitness | mutation test, lint, typecheck |

`test_quality` is intentionally separate from `test`. A green suite can be manufactured by
deleting, skipping, or weakening assertions; a mutation, diff, or policy command in this slot
must detect that class of change.

```sh
node .aidlc/bin/harness gauntlet doctor
node .aidlc/bin/harness gauntlet run --changed
node .aidlc/bin/harness gauntlet run --json
```

`doctor` requires at least one live capability per required profile. `run` treats a failed
command as a defect, a broken command as an error, an absent required owner as unavailable, and
any latency-budget breach as a failed gauntlet. The durable receipt is
`.aidlc/state/last-gauntlet.json` and conforms to `aidlc.sensor-run/v1`.

## Proving that a sensor earns its place

The conformance test creates healthy Python, TypeScript, and JVM-shaped projects and independently
seeds `do-nothing`, `test-cheating`, `boundary-breaking`, and `security-defective` changes. Each
defect must be caught by its owning profile within the configured budget. Qualification also
requires every profile to have a unique catch, preventing several decorative reviewers from
claiming the same failure.

```sh
node --test test/gauntlet.test.mjs
node .aidlc/bin/harness gauntlet qualify --file sensor-experiment.json
```

An experiment uses `aidlc.sensor-experiment/v1`: healthy baselines for `python`, `typescript`, and
`jvm`; one case for every stack/defect pair; `detected_by` profile names; and measured
`latency_ms`. A profile with no unique seeded-defect catch is a deletion candidate. Production
pods should rerun the same experiments using their real build commands before adoption and after
changing a sensor.
