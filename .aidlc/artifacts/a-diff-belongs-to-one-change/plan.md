---
status: approved
by: cwijayasundara
at: 2026-09-06T05:41:48.779Z
digest: sha256:bcd2bce776a1ee1e341f7b7afc6481868902faf3bf5085cd0077dd71578b4cdd
---
# Plan: a-diff-belongs-to-one-change

## Approach

The spec settled the mechanism: the current change is the open change whose spec approval is most
recent, and `governingPlans()` returns that change's approved committed plan or nothing. Every
consumer of ownership already reads through that one function, so the guard, `scope-drift`, and
the `## Files` check change behaviour without changing shape.

`currentChange(cfg)` in `artifacts.mjs` is the whole of the new logic: iterate `slugs(cfg)`, drop
closed intents, read each spec, keep those with `state === 'approved'`, and return the one with
the greatest `front.at`. It returns `{ slug, plan }` where `plan` is the approved committed plan or
`null`. `governingPlans()` becomes a one-line wrapper that returns `[plan]` or `[]`, keeping its
signature so `guard.mjs:10` and `scope-drift.mjs:55` need no change to their call sites.

The refusal messages are where F2 lives. `guard.mjs:81` today ends "or set
`[guard].require_contract = false`". It is replaced by two messages: one for no current change
("no open change has an approved spec — approve one, then its plan"), one for a current change
without an approved plan, which names the slug and says "approve its plan, or close it". Neither
names the switch.

`scope-drift` gains one rule id, `no-current-change`, and its `outside-scope` finding names the
current slug. `status` prints one line above the table and `session-start` pushes the same line
beside `contract:`.

The campaign assertion, `diff_owned_by_current_change`, lives in `evals/lib/campaign.mjs` next to
`behavioursHaveTests`: diff the working copy against the previous step's snapshot, drop artifact
and state paths, and check each remaining path against `currentChange(cfg).plan.owns`. The runner
already stages a pristine copy; it gains a per-step snapshot of the file list and digests so a step
can be compared with the step before it rather than with the fixture.

Amended during implementation, 2026-09-06: `evals/lib/assertions.mjs` is where every assertion
name is registered (`KNOWN`), and the first draft of this plan missed it. Also learned the hard
way: the hook reads `artifacts.mjs` live, so the moment `governingPlans` changed, the current
change became the one whose spec the owner had approved last — not this one — and this change's
own edits were refused with the message it had just written. The implementation order became
tests and consumers first, `artifacts.mjs` last, and the remaining edits wait on the owner
re-approving this spec, which is the mechanism working as specified.

Rejected: a `current` file under `.aidlc/state/`. It is a declaration, it goes stale, and the spec
argues it out.

Rejected: keeping every approved plan governing and adding the current one as a preference. That
is the routing-around the third instance recorded, with an extra step.

Rejected: closing a change automatically when its review is approved. It would make `implement`
close changes whose merge has not happened. Out of scope by the spec.

## Files

- `.aidlc/lib/artifacts.mjs`
- `.aidlc/lib/guard.mjs`
- `.aidlc/checks/scope-drift.mjs`
- `.aidlc/bin/harness`
- `.aidlc/hooks/dispatch.mjs`
- `.aidlc/skills/implement/SKILL.md`
- `evals/lib/campaign.mjs`
- `evals/lib/assertions.mjs`
- `evals/run.mjs`
- `evals/tasks.json`
- `test/current-change.test.mjs`
- `test/guard.test.mjs`
- `test/scope-drift.test.mjs`
- `test/campaign.test.mjs`
- `docs/OPERATING.md`
- `.aidlc/artifacts/a-diff-belongs-to-one-change/`

## Order

1. `test/current-change.test.mjs` — B1 and B4 over a hand-built artifacts directory: two open
   changes with approved specs, the later `at:` wins; a closed change with the latest `at:` is
   skipped; a draft spec is skipped; no approved spec returns `null`. Red first: `currentChange`
   does not exist.
2. `.aidlc/lib/artifacts.mjs` — `currentChange(cfg)`; `governingPlans(cfg)` returns
   `[current.plan]` or `[]`. Green.
3. `test/guard.test.mjs` — B2 and B3: a path named by an older change's plan is refused under a
   newer current change, and the message names the current slug; a current change with no
   approved plan refuses with "approve its plan, or close it"; no message contains
   `require_contract = false`. The existing single-plan tests pass unchanged.
4. `.aidlc/lib/guard.mjs` — the two messages at the `require_contract` branch, reading
   `currentChange` for the slug. Green.
5. `test/scope-drift.test.mjs` — B5: the existing "whichever is newest" test at line 49 inverts
   to assert the older plan's file is a finding naming the current slug; a repo with approved plans
   but no current change reports `no-current-change`.
6. `.aidlc/checks/scope-drift.mjs` — the rule id and the message. Green.
7. `.aidlc/bin/harness` `status` and `.aidlc/hooks/dispatch.mjs` `session-start` — B6: one
   line, `current: <slug> (plan approved)` or `current: <slug> — plan not approved` or
   `current: none — approve a spec`. Test in `test/current-change.test.mjs` through the CLI and
   the hook action, the same way `test/supersedes.test.mjs` tests B4 of supersession.
8. `.aidlc/skills/implement/SKILL.md` — one sentence: the last step of a delivered change is
   setting `status: closed` in its `intent.md`, because an open change with an approved spec is
   the current change until it is closed.
9. `evals/run.mjs` — snapshot `{ path: digest }` of the working copy after each step into the
   step context as `previous`; `evals/lib/campaign.mjs` — `diffOwnedByCurrentChange(dir,
   previous)`; `test/campaign.test.mjs` — a changed product file the current plan names passes,
   one it does not name fails naming the file. `evals/tasks.json` — `campaign-ledger` sprint 3
   gains `{ "diff_owned_by_current_change": true }` (B7).
10. `docs/OPERATING.md` — one paragraph replacing the sentence that says any approved plan owns a
    path: the current change, how it is chosen, and that closing a change is how it stops being
    current.
11. Run `node evals/run.mjs --id campaign-ledger --require-auth`. Record the sprint 3 outcome in
    `.aidlc/artifacts/a-diff-belongs-to-one-change/evidence.md`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/current-change.test.mjs` — the open change with the latest approved-spec `at:` is current; none when no open spec is approved |
| B2 | `test/guard.test.mjs` — a path named only by an older change's plan is refused, naming the current slug |
| B3 | `test/guard.test.mjs` — a current change with no approved plan refuses every product write and no message mentions `require_contract = false` |
| B4 | `test/current-change.test.mjs` — a closed change with the latest `at:` is not current and its plan is not returned by `governingPlans` |
| B5 | `test/scope-drift.test.mjs` — a file owned by another change's plan is a finding naming the current slug; `no-current-change` when none |
| B6 | `test/current-change.test.mjs` — `harness status` and the `session-start` action both print the `current:` line |
| B7 | the `campaign-ledger` run recorded in `.aidlc/artifacts/a-diff-belongs-to-one-change/evidence.md`: sprint 3's `diff_owned_by_current_change` assertion passes |
