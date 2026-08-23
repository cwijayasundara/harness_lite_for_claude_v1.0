---
name: coverage-first
description: Checks the existing test coverage of a region before changing it, so the level of care matches the safety net actually present. This skill should be used before modifying any existing code, and whenever deciding how much testing a change needs.
---

# Look at the net before you jump

Before editing a region, find out what protects it:

```
bash .claude/bin/harness check --stage drift        # runs coverage, if the project has it
```

Then judge, per region:

| What you find | What to do |
|---|---|
| Covered, with meaningful assertions | Change it. The suite will tell you if you broke it. |
| Covered by line, but the assertions are thin | Strengthen the assertions first. High line coverage with weak assertions is worse than none, because it buys false confidence. |
| Not covered | Use `pin-behaviour` first. Do not edit blind. |

Coverage is a **map of where you are safe**, not a target to hit. Do not write tests to raise
a number; write them where you are about to be dangerous. A project at 40% coverage where the
40% is the payment path is in better shape than one at 80% that covers only the getters.
