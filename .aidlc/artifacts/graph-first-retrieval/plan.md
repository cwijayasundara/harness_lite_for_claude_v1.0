---
status: approved
spec_digest: sha256:918c9346da19648c66d0bddabf2d6cdd8f1f4a63e64d1a480b4d24df7949d263
spec_approval_digest: sha256:75d2c7e8a76269e7ec5d727e85c0b4dd25330f2d23f69a684992346ca0d735c8
by: cwijayasundara
at: 2026-09-08T17:27:53.729Z
digest: sha256:37bdf12e6f98e258039d8c559b9af5d4119f5e502ad45fe2eae9d3770a3506c1
approval_version: 2
approval_digest: sha256:8ce565a3ac25058dd8969e3e56ac295898030a82001bfed24ecfb234886179c7
---
# Plan: graph-first-retrieval

## Approach

Repair usage of the existing graph and pack. Grant explorer Bash so it can
run the two lookup commands, keep it write-blocked, and state graph-first
lookup in the existing steering files. Leave `preSearch` advisory. Rewrite
the lean-review disposition instead of expanding the index.

The alternative — deny Grep/Glob or add a Fusion agent — was rejected: Law 7
forbids a required graph, the agent budget is full, and Fusion is a new
control. Advisory-only hints are what failed today, so steering plus explorer
access is the smallest change that can actually change the first tool call.

## Files

- `.aidlc/roles/explorer.md`
- `.aidlc/roles/explorer.contract.json`
- `.aidlc/instructions.md`
- `.claude/CLAUDE.md`
- `.aidlc/skills/map/SKILL.md`
- `.aidlc/skills/implement/SKILL.md`
- `.aidlc/skills/change-safely/SKILL.md`
- `docs/IMPROVEMENT-PLAN.md`
- `test/graph-first.test.mjs`
- `test/contracts.test.mjs`
- `test/graph.test.mjs`

## Order

1. Add failing tests in `test/graph-first.test.mjs` for explorer tools,
   graph-first wording, miss-path grep, and no Grep deny / no unsolicited pack.
2. Update `.aidlc/roles/explorer.contract.json` and `.aidlc/roles/explorer.md`.
3. State the lookup rule in `.aidlc/instructions.md` and regenerate
   `.claude/CLAUDE.md` with `harness init`.
4. Edit `.aidlc/skills/map/SKILL.md`, `.aidlc/skills/implement/SKILL.md` and
   `.aidlc/skills/change-safely/SKILL.md`.
5. Rewrite the lean-review row in `docs/IMPROVEMENT-PLAN.md`.
6. Extend `test/contracts.test.mjs` and `test/graph.test.mjs` only if existing
   assertions need the new explorer tools or wording.
7. Run `harness check --stage stop`, then commit-stage diagnostics.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/graph-first.test.mjs` explorer tools include Bash, exclude Write/Edit, body names graph/pack first; `test/contracts.test.mjs` tools match contract and `may_write` |
| B2 | `test/graph-first.test.mjs` instructions, map, implement and change-safely name graph/pack first and Grep as miss path; map skill lacks skippable-optional hedge; no CRITICAL/YOU MUST NEVER GREP |
| B3 | `test/graph-first.test.mjs` preSearch still returns allow/advisory additionalContext without a pack dump; `test/graph.test.mjs` callers miss still names `grep -rn` |
| B4 | `test/graph-first.test.mjs` improvement-plan row names freeze-expansion and repair-usage; `test/budget.test.mjs` / `test/contracts.test.mjs` still enforce unchanged `[limits]` and agent count |

## Gate status

Prepared for review. Spec and plan remain drafts. Implementation starts after
the user's `harness approve` of spec, then plan.
