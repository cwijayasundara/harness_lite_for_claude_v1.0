---
name: plan
description: Turns an approved spec.md into a plan.md — the exact files that will change, the order of work, the risk tier, and which test proves each spec behaviour. This skill should be used after a spec is approved and before writing any code, and whenever a change is about to touch more than one file. The file list is enforced against the diff by harness check --stage commit.
---

# Write the plan

The plan is what makes a change **predictable**. It is also the only artefact the harness can
mechanically check the diff against, which is why the file list is not optional.

## Do this

1. Read the spec. If its status is not `approved`, stop and say so.
2. Explore the code properly before writing anything. Use the `explorer` agent for breadth so
   the main context stays clean.
3. `bash .claude/bin/harness new plan <slug>`.
4. Fill the **`## Files`** fenced block with every path you will touch, one per line. Directory
   prefixes are allowed (`src/search/`). Be honest: a short list you then violate is worse than
   a long one.
5. Fill **`## Proof`** — name the test that demonstrates each numbered spec behaviour. "The
   suite passes" is not proof.
6. Set the **risk tier**. `low` = reversible and isolated. `standard` = default. `critical` =
   auth, payments, migrations, data deletion, anything with a blast radius.
7. Stop at human gate 2.

## Risk tier changes what happens later, not what you write now

| Tier | Review | Merge |
|---|---|---|
| low | agent review only | first green CI |
| standard | agent review + code owner | code owner approval |
| critical | agent review + code owner + a named second human | explicit sign-off, rollback rehearsed |

## Anti-patterns

- A file list that says `src/`. That defeats the drift check; be specific.
- Planning the refactor and the behaviour change together. Two plans, two commits.
- Ordering work by module. Order it so something is demonstrably working as early as possible.
