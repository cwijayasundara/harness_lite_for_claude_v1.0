# Delivery contract: no-name-points-at-nothing

- **Schema:** aidlc.contract/v1
- **Change id:** no-name-points-at-nothing
- **Intent ref:** ../intent-refs/no-name-points-at-nothing.json
- **Story ref:** none
- **Risk:** low
- **Spec status:** approved
- **Spec approval digest:** sha256:ce7e44f46fc64546722e2f932e98d2150ac5674fd6b1c9a7101f06996e1ad976
- **Plan status:** draft
- **Plan approval digest:** pending

## Outcome

A stage entry names something that runs, and the backlog lists only work that is outstanding.

## Observable behaviours

### B1

Given every `harness.toml` in the repository,
When each stage entry is resolved,
Then it is another stage, a registered local check, or a capability verb. A name that resolves to
none of those fails the suite, naming the file and the entry.

### B2

Given a new `harness.toml` added anywhere in the repository,
When the suite runs,
Then it is checked too. The test discovers configuration files rather than listing them, because
a hand-maintained list is the same class of thing as the defect it catches.

### B3

Given `examples/scratch-py` and `examples/scratch-ts`,
When their commit stages are read,
Then neither names `plan-drift`, and both name `scope-drift` — the control the template installs
and the one that actually exists.

### B4

Given the examples,
When their other stages are read,
Then they still differ from each other and from the template: `scratch-ts` typechecks where
`scratch-py` formats. Making every name resolve must not flatten two examples into one.

### B5

Given `status-grades-two-lifecycles`,
When the intent is read,
Then its status is `closed` and it names the change that resolved it.

## Out of scope

`harness doctor` performing this resolution against a downstream project's config at install time
— recorded as the intent's open question. Any change to what the examples do, beyond the name that
does not resolve. The `[guard]` and `[sensors]` sections of the examples.

## Entities and existing context

- `LOCAL_CHECKS` (`.aidlc/lib/runner.mjs:15`) — `secrets`, `scope-drift`, `budget`. Not exported
  today; the test needs the same list the runner uses, not a copy of it.
- `VERBS` (`.aidlc/lib/config.mjs:6`) — the capability verbs a stage entry may name.
- `resolveStage` (`.aidlc/lib/config.mjs`) — already resolves one level of stage indirection and
  throws on a cycle. Reused rather than re-implemented.
- `plan-drift` — removed from `.aidlc/harness.toml`, the template, and `_base`, but never from the
  two examples. It has had no implementation since `303b58b`.
- `the _base fixture is governed by the same agent-gating settings the template installs`
  (`test/evals.test.mjs`) — the narrower parity test this generalises past. Parity is the wrong
  rule for the examples, which legitimately differ.

## Approach and rejected alternatives

Export the local-check names from `runner.mjs`, then walk every `harness.toml` under the
repository, resolve each stage entry, and fail on anything that is neither a stage, a local check,
nor a verb.

Rejected: extending the `_base` parity test to the examples. Parity would demand `scratch-ts` run
`fmt` because the template does, which is wrong — it is a TypeScript project. The examples differ
on purpose; what they may not do is name something that does not exist.

Rejected: hardcoding the list of configuration files in the test. The defect is a name nobody
checked; a test that only checks the files someone remembered to list reproduces it one layer up.

Rejected: deleting the examples' `[stages]` and letting them inherit defaults. It would fix the
dangling name by removing the thing the examples exist to demonstrate.

Rejected: copying the local-check names into the test. Two lists that must agree is the shape of
every defect this session has found; the test reads the runner's own list.

## Structure and ownership

| Path | Change |
|---|---|
| `.aidlc/lib/runner.mjs` | export the local-check names |
| `examples/scratch-py/.aidlc/harness.toml` | `plan-drift` -> `scope-drift` |
| `examples/scratch-ts/.aidlc/harness.toml` | `plan-drift` -> `scope-drift` |
| `test/contracts.test.mjs` | B1 to B4 |

## Safeguards

- B2 is the safeguard: discovery rather than a list, so a configuration added later is covered
  without anyone remembering to add it.
- B4 pins that the examples stay different from each other, so this fixes a dangling name without
  collapsing the thing two examples are for.
- The test reads `LOCAL_CHECKS` and `VERBS` from the modules that define them, so a control
  renamed in the runner cannot leave the test asserting against a stale copy.
- Nothing about what the examples *do* changes: only a name that resolved to nothing.

## Operations

1. Export the local-check names from `.aidlc/lib/runner.mjs`.
2. Add the resolution test to `test/contracts.test.mjs`, discovering every `harness.toml`.
3. Replace `plan-drift` with `scope-drift` in both example configurations.
4. Close `status-grades-two-lifecycles`, naming `retire-the-legacy-lifecycle` as its resolution.
5. `harness check --stage commit`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/contracts.test.mjs` — every stage entry in every config resolves |
| B2 | the same test discovers configs by walking the repository |
| B3 | both example commit stages name `scope-drift` |
| B4 | `test/contracts.test.mjs` — the examples still differ from each other |
| B5 | `.aidlc/artifacts/intent/status-grades-two-lifecycles.md` reads `closed` |
