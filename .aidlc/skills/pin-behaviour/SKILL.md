---
name: pin-behaviour
description: Pins existing behaviour with characterisation tests before modifying untested legacy code, so that a change of behaviour cannot happen silently. This skill should be used before editing any code that has no test covering it, and whenever working in an unfamiliar or legacy area of a codebase.
---

# Pin the behaviour before you change it

Untested code has no specification — it has behaviour. Some of that behaviour is load-bearing
and undocumented, and you will not find out which until production does.

1. Run the code and **record what it actually does**, including for bad input, empty input,
   and the edge you think nobody hits.
2. Write tests that assert exactly that — including the parts that look like bugs. You are
   pinning reality, not endorsing it.
3. Commit those tests **on their own**, before touching the implementation. That commit should
   be green on the unmodified code.
4. Now change the code. Any characterisation test that goes red is a behaviour change: either
   intended (update it, and say so in the commit message) or a regression you just caught.

If a behaviour you pinned is clearly wrong, do not fix it in the same commit. Note it, finish
the change, then fix it separately with its own intent.
