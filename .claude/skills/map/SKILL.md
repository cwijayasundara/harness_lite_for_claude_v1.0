---
name: map
description: Answers questions about how a codebase fits together using the harness graph — who calls a symbol, what it calls, which modules are hubs, what import cycles exist, and what changed under a symbol since a ref. This skill should be used before planning a change in unfamiliar code, when tracing a symbol's blast radius, and instead of reading whole files to find something.
---

# Ask the graph before you read files

The graph answers exactly five questions. Pick the one you are actually asking — that choice
matters more than anything else here, because asking the wrong one wastes a turn and sends you
reading files anyway.

| You want to know | Command |
|---|---|
| Who would break if I change this | `bash .claude/bin/harness graph query callers <symbol>` |
| What this depends on | `bash .claude/bin/harness graph query calls <symbol>` |
| Where the load-bearing modules are | `bash .claude/bin/harness graph query hubs` |
| Whether the structure has knots | `bash .claude/bin/harness graph query cycles` |
| What this change has already touched | `bash .claude/bin/harness graph query changed-since HEAD` |

To read code rather than list it, ask for a budgeted pack instead of opening files:

```
bash .claude/bin/harness pack "<symbol>"          # ~1200 tokens: definition, callees, callers
bash .claude/bin/harness pack "<symbol>" --budget 2500
```

`.claude/state/wiki/INDEX.md` is the rendered map — hubs, cycles, and one page per cluster.
Read a single cluster page rather than the index plus everything it links to.

## It is a cache, not an authority

The graph is line-oriented, not a compiler. Module imports are reliable; call edges are a good
heuristic filtered against the known symbol table. So:

- **A miss means grep, not "it does not exist."** The commands say so when they miss; believe them.
- **Never conclude nothing calls something from the graph alone.** Confirm a negative with grep.
- **A `STALE since` banner means the last refresh failed.** Verify anything load-bearing against
  the source before you rely on it.

## Do not

- Read `.claude/state/graph.json` directly. It is a cache format and it will change.
- Rebuild the graph by hand mid-task — the `Stop` hook coalesces edits and refreshes once.
