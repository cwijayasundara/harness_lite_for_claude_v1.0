# Delivery contract: p0-unblock-the-loop

- **Schema:** aidlc.contract/v1
- **Change id:** p0-unblock-the-loop
- **Intent ref:** ../intent-refs/p0-unblock-the-loop.json
- **Story ref:** none
- **Risk:** standard
- **Spec status:** draft
- **Spec approval digest:** pending
- **Plan status:** draft
- **Plan approval digest:** pending

## Outcome

An engineer — or an agent — can run `harness check --stage stop`, see the unit suite actually
execute, and read a ledger in which each session is one run.

## Observable behaviours

### B1

Given `[guard].require_contract = true` and no approved contract,
When a read-only shell command that merely redirects a file descriptor is submitted
  (`echo hi 2>/dev/null`, `harness check --stage stop 2>&1 | tail`),
Then the guard does not block it.

### B2

Given the same configuration,
When a command whose redirect target is a product file is submitted (`echo x > src/app.py`),
Then the guard still blocks it.

### B3

Given a clean tree,
When `harness check --stage stop` runs,
Then `secrets` passes and `test` executes rather than being skipped, and the gauntlet's
hardening profile still detects the injected `security-defective` fixture.

### B4

Given two separate sessions,
When the session-start hook fires in each,
Then `ledger.report()` counts two runs rather than one, and `HARNESS_RUN_ID` still pins the run
when set.

## Out of scope

Re-running the eval suite and refreshing the baseline (P1). Rewriting the secrets scanner's
pattern set. Any change to the budget limits.

## Entities and existing context

- `writeTargets` — the write-destination extraction already implemented inline in
  `bashTouchesProtected` (`.aidlc/lib/guard.mjs:98`), whose header comment documents this exact
  defect class being fixed once already.
- `bashContractBlocked` (`.aidlc/lib/guard.mjs:121`) — the sibling that still asks whether `>`
  appears anywhere in the string.
- `runId` / `report` (`.aidlc/lib/ledger.mjs:12,48`) — `report().runs` is the denominator behind
  `KILL.min_sessions = 50`.
- `harness:allow-secret` (`.aidlc/checks/secrets.mjs:33`) — a per-line opt-out the scanner already
  documents in its own `fix:` string.

## Approach and rejected alternatives

Extract the existing target parser into one exported `writeTargets(cmd)` and have both guards ask
it the same question, then filter targets that are not product files (`/dev/*`, and the
`.aidlc/artifacts|state` carve-out the old code applied to the whole command string rather than
per target).

Rejected: adding `2>` as a special case to the existing regex. It fixes the one reported symptom
and leaves the two functions disagreeing about what a write is — which is how the defect survived
its first fix. Rejected: setting `fail_fast = false` to stop the secrets failure hiding the suite.
That treats the symptom and loses fast feedback; the finding is a false positive and should be
marked as one.

## Structure and ownership

| Path | Change |
|---|---|
| `.aidlc/lib/guard.mjs` | export `writeTargets`; both guards consume it |
| `.aidlc/lib/ledger.mjs` | add `newRun()` |
| `.aidlc/hooks/dispatch.mjs` | rotate the run id on `session-start` |
| `test/gauntlet.test.mjs` | mark line 92 `harness:allow-secret` |
| `test/guard.test.mjs` | regression cases for B1 and B2 |

## Safeguards

- The trade stated in the existing guard comment is preserved: a write may slip through, a read
  is never blocked. It is a guard, not a permission system.
- The `security-defective` fixture written by the gauntlet must still contain a live-looking
  secret; the marker goes on the JavaScript source line, never inside the template literal.
- `HARNESS_RUN_ID` continues to win over rotation so CI can pin a run across steps.
- No test is weakened and no threshold is raised to make a check pass.

## Operations

1. In `.aidlc/lib/guard.mjs`, extract the target-collection body of `bashTouchesProtected` into an
   exported `writeTargets(cmd)`; reduce `bashTouchesProtected` to a lookup over its result.
2. In the same file, rewrite `bashContractBlocked` to filter `writeTargets(cmd)` for product-file
   destinations and return `null` when none remain.
3. In `test/guard.test.mjs`, add the B1 and B2 cases.
4. In `test/gauntlet.test.mjs`, append `// harness:allow-secret` to line 92.
5. In `.aidlc/lib/ledger.mjs`, add `newRun(L)` honouring `HARNESS_RUN_ID`.
6. In `.aidlc/hooks/dispatch.mjs`, call `ledger.newRun(cfg.layout)` at the top of `session-start`.
7. Run `harness check --stage stop`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/guard.test.mjs` — redirect of a file descriptor is not a write |
| B2 | `test/guard.test.mjs` — redirect to a product path is still blocked |
| B3 | `harness check --stage stop` output; `test/gauntlet.test.mjs` Phase 4 conformance still asserts `hardening` detects `security-defective` |
| B4 | `test/unit.test.mjs` / ledger report over two rotated ids; `HARNESS_RUN_ID` override |
