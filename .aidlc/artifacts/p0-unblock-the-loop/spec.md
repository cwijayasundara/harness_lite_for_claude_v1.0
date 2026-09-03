---
status: draft
migrated_from: sha256:4825cb8d7060fc374f9b8468f9c85314cae015af29d8d79bd686524633d7fce7
---
# Spec: p0-unblock-the-loop

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

## Safeguards

- The trade stated in the existing guard comment is preserved: a write may slip through, a read
  is never blocked. It is a guard, not a permission system.
- The `security-defective` fixture written by the gauntlet must still contain a live-looking
  secret; the marker goes on the JavaScript source line, never inside the template literal.
- `HARNESS_RUN_ID` continues to win over rotation so CI can pin a run across steps.
- No test is weakened and no threshold is raised to make a check pass.

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
