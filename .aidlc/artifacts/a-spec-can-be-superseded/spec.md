---
status: approved
by: cwijayasundara
at: 2026-09-04T17:20:45.559Z
digest: sha256:70dbdf4e12d4eb1c6ab623562764507049047cbb2cc580f136bfb71b82d412c0
---
# Spec: a-spec-can-be-superseded

## Outcome

Someone reading an approved `spec.md` can tell whether it is still true, without reading every
change that came after it.

## The shape, argued from F9

Three candidates were left open by the intent. The evidence picks one.

**Amending the superseded spec in place** is what the agent was implicitly reaching for and it is
wrong. It edits an approved artifact, so the digest changes, `stale-approval` fires, and gate 1
re-opens on a change that is already merged — for a fact discovered by a *different* change. It
also rewrites what sprint 1 promised, which is precisely the record a reviewer needs to keep.

**A derived contradiction-detector** — read every approved spec and infer which behaviours later
changes broke — needs a model to decide whether two prose behaviours conflict. F9 shows why that is
unreliable in exactly the case that matters: the agent that *had* the full context called a
reversal a clarification. An inference layer would make the same mistake with less information.

**A declaration in the superseding change** is what remains, and it fits what actually happened.
The agent already identified `ledger B2` by id. It needed a field, not an analysis. Writing the
link into the *new* spec costs one line, touches no approved artifact, rewrites no history, and
requires no judgement the agent has not already made.

The superseded spec is therefore never edited. Its state is *computed* from the links pointing at
it, the same way `stale-approval` is computed rather than stored.

## Observable behaviours

### B1 — a change declares what it supersedes

Given a `spec.md` being written,
When it reverses a behaviour an earlier approved spec claims,
Then it may record `supersedes: <slug>#<behaviour-id>` in its frontmatter, one entry per superseded
behaviour.

### B2 — the declaration is checked

Given a `supersedes:` entry,
When the artifact is read or approved,
Then the named slug must exist, its spec must be approved, and the named `### B<n>` must appear in
it. A link to a behaviour that does not exist is a typo pointing at nothing, and it fails rather
than sitting silently wrong — `no-name-points-at-nothing` is already a closed change in this
repository for the same reason.

### B3 — the superseded artifact is never touched

Given a spec whose behaviour is superseded by a later approved change,
When the supersession takes effect,
Then that spec's file is unchanged: its `status: approved`, its `by:`, its `at:` and its `digest:`
all stand, and it does not report `stale-approval`. The record of what was promised is evidence,
and a change that edits it destroys the thing a reviewer came to read.

### B4 — a reader can tell

Given an approved spec with a superseded behaviour,
When `harness status` runs,
Then it names the spec, the behaviour and the change that superseded it. And when a session starts,
the same fact is pushed through `SessionStart` — `evidence.md` F6 records a mechanism that failed
for being available on request rather than delivered, and this must not repeat it.

### B5 — supersession takes effect only when approved

Given a draft spec declaring `supersedes:`,
When it has not been approved,
Then nothing is superseded. A behaviour is retired by a human's gate, not by an agent writing a
line in a draft.

### B6 — the campaign grades the fact, not the vocabulary

Given `campaign-ledger` sprint 3,
When it completes,
Then `evolving-scope` B5 is asserted against a recorded `supersedes:` link naming sprint 1's
behaviour id, replacing the `transcript_matches` on `(?i)(supersed|contradict)` that F9 shows
grades word choice. The agent that said "evolves" instead of "supersedes" did the analysis; the
suite should measure whether it recorded the result.

## Out of scope

- **F10's second dimension of ownership** — that sprint 3 changed product behaviour under sprint
  2's plan because that plan owned the path. Observed once. Whether the answer is "a sprint always
  needs its own change" or "ownership needs a purpose as well as a path" is a guess until something
  fails for want of it.
- **A product-level accumulated spec.** Law 11 gives this change a failing eval and one recorded
  defect. That earns a link and a computed state. It does not earn a new layer.
- **Detecting contradictions the agent did not declare.** See the argument above: F9 is the case
  where inference would have got it wrong.
- **Amending, retiring or deleting behaviours generally.** Only supersession by a later change.

## Safeguards

- No new skill and no new hook binding: skills are 7/7 and bindings 4/5, and the budget is not a
  number to raise. B4's `SessionStart` line is content in a binding that already fires.
- The existing approval tests are the regression suite for B3 and must pass unchanged.
- A `supersedes:` link must never be able to change another artifact's file on disk. B3 is the
  behaviour; a test asserting the superseded file is byte-identical afterwards is the proof.
