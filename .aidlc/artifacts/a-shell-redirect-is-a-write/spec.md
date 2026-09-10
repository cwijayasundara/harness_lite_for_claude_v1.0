---
status: approved
source: docs/DEFECT-REPAIR-PLAN.md
source_revision: 62fea335060175a6327494e6abe04cb37d3c94e4
source_digest: sha256:b67be150acb1a9406bdef8bbd0480c3d2cdf493c26656a38e4db4791f3f2bbb7
source_kind: repository
intent_digest: sha256:35f60502e8c61891cfcc1aade02f44a1a4e398de08942cb9fb38620240b3c730
intent_input_digest: sha256:db1f0ac7af6b8e82f11fcf8a87c17cef9d7e48ca33d383e5f1d5e7b22a77bb24
intent_revision: b083b2381bcdc5e078b525bdd6a21fbf3f886c92
by: cwijayasundara
at: 2026-09-10T13:29:44.873Z
digest: sha256:caac2fb92238b930dc0b984f8553a93c12d9c92b0659cfdd4e06a93a94e7a854
approval_version: 2
approval_digest: sha256:66bc44d4d1f3970ef0907db80f597de14b2b8bd3cdb38ae24a4083ddbf22f161
---
# Spec: a-shell-redirect-is-a-write

## Outcome

One question about ownership, asked in one place, answered the same way whichever tool asks it.

## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| D1: the Bash and Write/Edit paths return the same verdict for the same target | B1 |
| D1: a path the approved plan names stays writable through the shell | B2 |
| D1: the three historical false blocks stay allowed | B3 |
| D1: tightening the verdict must not widen what counts as a target | B3 |
| D1: `scope-drift` keeps failing an unowned committed change | B6 |
| local: out-of-tree targets are outside the contract on both paths | B4 |
| local: a bash refusal names the rule that produced it | B5 |

## Observable behaviours

### B1

Given `[guard].require_contract` is on and a change is selected whose committed approved plan
names some paths,
When a shell command writes to a path that plan does not name,
Then the command is refused, and the refusal is the same message the Write tool returns for that
same path.

This holds for every class of target: a path the plan owns, a path it does not, a
`[guard].protected_paths` path, a path under `.aidlc/artifacts/` or `.aidlc/state/`, and a
`/dev/` target. For one target there is one verdict, and which tool asked is not part of it.

A command with several write targets is refused if any one of them would be refused, and the
refusal names that target rather than the first one extracted.

### B2

Given the same conditions,
When a shell command writes to a path the selected change's approved plan does name,
Then it proceeds. Ownership is what the human approved, and it is honoured through the shell
exactly as it is through Write and Edit.

Commands writing under `.aidlc/artifacts/` and `.aidlc/state/` also proceed, whether or not any
plan is approved, so an intent and a spec can still be written before a plan exists to own them.

### B3

Given any configuration,
When one of the commands this rule has already fired wrongly against is run — `echo hi
2>/dev/null`, `node .aidlc/bin/harness check --stage stop 2>&1 | tail -30`, or a `git commit`
whose message carries a `Co-Authored-By: ... <noreply@...>` trailer —
Then it is allowed.

What counts as a write target does not change. `writeTargets` keeps its current extraction,
regex-level per the tree-sitter decision in `docs/BUILD-PLAN.md` Phase 3, including the descriptor,
`/dev/`, end-of-line, `=>`/`>=` and quoted-then-empty narrowings that each came from a recorded
false block. This change alters only what happens to a target once extracted; a test asserting the
extraction itself is unchanged proves the two were kept separate.

### B4

Given a shell command that writes to a path outside the repository — an absolute path under a
temporary directory, or one that resolves above the repository root,
When the guard evaluates it,
Then it is allowed, because a path outside the repository is outside what any `## Files` section
can describe.

This matches what the Write path already does, and it is a relaxation of today's bash behaviour
in the case where nothing is approved, where such a write is currently refused. The two paths
compute the repository-relative path the same way, so they cannot disagree about which side of the
root a target falls on.

### B5

Given a shell command refused by the contract guard,
When the refusal is recorded,
Then the ledger row names the rule that actually produced it — `write-scope`, `protected-path`,
`prefix-cache` or `test-lock` — rather than labelling every one `contract-scope`.

A rule id exists so that `harness ledger audit` can tell a caught mistake from a false block. A
single label across four different rules cannot answer that question, and having routed the
decision through the named form, discarding the name is the one thing the routing must not do.

### B6

Given an unowned change that has already been committed,
When `harness check --stage commit` runs,
Then `scope-drift` still fails it.

Prevention is being repaired; detection is not being traded away for it. Both are asserted, so a
later simplification cannot quietly remove one on the grounds that the other exists.

## Design

`bashContractRefusal(cmd, cfg)` extracts write targets exactly as today, normalises each one to a
repository-relative path with the same computation `preWrite` uses in `.aidlc/hooks/dispatch.mjs`,
drops the ones the existing carve-outs drop, and then asks `writeRefusal` about each survivor. The
first refusal is returned. There is no second opinion about ownership because there is no second
implementation of it.

`bashContractBlocked` stays, returning the refusal string, so that every existing caller and test
keeps its current shape. This is the same named-form/string-form split `writeRefusal` and
`writeBlocked` already use, and it exists for the same reason: changing a shared return type
breaks assertions in test files this change does not own, for no gain to anyone but the one caller
that wants the name. `preBash` in `dispatch.mjs` is that caller and moves to the named form.

**What is deliberately preserved.** The `require_contract` early return stays, so a repository
that has the contract guard off sees no change on either path. `artifactOrState`, `/dev/` and
quoted-then-empty targets are filtered before the question is asked, not inside the answer, so the
carve-outs remain visible at the call site where their reasons are written down. `writeTargets` is
not touched.

**Two decisions carried from the intent, recorded here for approval.**

*Out-of-tree targets become allowed on the bash path.* The alternative is to refuse them on both
paths, which would be a new restriction this defect does not justify, would break the Write path
for every existing caller, and would make a session unable to use its own scratchpad directory.
The chosen answer is the more permissive of the two, and it is chosen because it is the one the
approved-plan mechanism can actually express: `## Files` names paths in this repository and says
nothing about anywhere else.

*The bash refusal reports the real rule id.* Existing `contract-scope` rows in the ledger keep
their meaning as history; new rows are more specific. Any ledger analysis keyed on the literal
string `contract-scope` sees fewer rows after this lands, which is the intended effect and not a
regression.

**What this does not become.** A shell guard built on a regex is a workflow control that tells an
agent it is out of scope before it does the work. It is not a sandbox and not a permission system,
and a determined command can still get past it. The repair closes a hole that made it useless
during exactly the period it was meant to be useful; it does not change what kind of thing it is.

## Out of scope

- Changing `writeTargets`, or replacing the regex with a shell parser. `docs/BUILD-PLAN.md`
  Phase 3 settled that and this change does not reopen it.
- The duplicate `stop` execution inside the commit check — `docs/DEFECT-REPAIR-PLAN.md` D2,
  backlog F04.
- Removing Docker from the test path — D3, backlog F18.
- The rest of `a-block-names-its-rule`. Only the one `preBash` call site changes here.
- Any claim that the guard is a security boundary.

## Safeguards

- **The false-block cases stay green.** `test/guard.test.mjs` already holds them and they are
  asserted, not rewritten. A test weakened to make this pass would remove the only record of six
  recorded false fires.
- **Fixtures under `evals/fixtures/` are untouched.**
- **Zero dependencies; `[limits]` unchanged.** No new skill, hook, agent or control — this is a
  repair to an existing control, which is what Law 11 permits and what it distinguishes from
  growth.
- **No refusal prints file contents or credential values.** Refusals name paths and rules.
- **The commit-stage checks must be green before this is claimed done**, and the repaired guard
  applies to the session that repairs it: commands that work today will begin to be refused while
  this change is being built, and the correct response is to name the path in `## Files`, not to
  route around the guard.
