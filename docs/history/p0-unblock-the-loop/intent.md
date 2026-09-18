---
status: closed
migrated_from: aidlc.contract/v1
---
# Intent: p0-unblock-the-loop

- **Status:** approved
- **Author:** cwijayasundara

## Problem

The harness cannot currently run the check its own CLAUDE.md declares non-negotiable, and the
ledger that decides which controls survive has stopped distinguishing sessions. Three defects
compound:

1. `bashContractBlocked` classifies any command containing `>` as a write. `echo hi 2>/dev/null`
   is refused. So is `harness check --stage stop 2>&1 | tail`. The identical defect was found and
   fixed in `bashTouchesProtected` — the comment above it records that it "fired six times
   against read-only commands in the session that fixed it" — but the sibling function was left
   on the old regex.
2. `--stage stop` fails on a fixture secret in `test/gauntlet.test.mjs:92`, which is a deliberate
   defect-injection string. With `fail_fast = true` the entire unit suite is skipped, so a
   false positive in a 20-line scanner hides 24 test files.
3. `ledger.runId()` writes `current-run-id` once and never rotates it. 1,185 rows spanning eight
   days report as one run, so every control sits at `insufficient-data` and `ledger audit` — the
   only query that authorises deleting a control — cannot return a verdict.

## Outcome

`--stage stop` runs green on a clean tree, read-only shell commands are not refused, and the
ledger counts sessions.

## Affected systems

`.aidlc/lib/guard.mjs`, `.aidlc/lib/ledger.mjs`, `.aidlc/hooks/dispatch.mjs`,
`test/gauntlet.test.mjs`, `test/guard.test.mjs`.

## Constraints

Zero dependencies. No control may be weakened to pass: the secrets finding is silenced with the
scanner's own documented `harness:allow-secret` marker on the source line, and the injected
fixture content still carries a live secret so the hardening sensor still detects it.

## Open questions

None. All three defects are reproduced.
