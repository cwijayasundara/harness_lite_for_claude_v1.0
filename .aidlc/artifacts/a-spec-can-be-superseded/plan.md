---
status: draft
---
# Plan: a-spec-can-be-superseded

## Approach

The spec settled the shape: a `supersedes:` link in the superseding change's frontmatter, and a
state on the superseded spec that is *computed* rather than written. So the superseded file is never
touched, its approval and digest stand, and B3's proof is that the file is byte-identical afterwards.

Four pieces, and the first two are the whole of it.

`supersedes:` is a frontmatter list on `spec.md`, each entry `<slug>#<behaviour-id>`. `artifacts.mjs`
already parses frontmatter and already computes a derived state — `stale-approval` is exactly this
pattern: not stored, recomputed from the digest every time the artifact is read. `supersededBy(cfg)`
joins the same way, scanning approved specs for links and returning a map from `slug#B<n>` to the
slugs that superseded it. One pass over artifacts that `status` already makes.

Validation at approval time, in `approve()`, beside the preconditions that are already there: the
named slug exists, its spec is approved, and the named `### B<n>` appears in it. That is B2, and it
is the same shape as the check `a-plan-proves-its-spec` is adding one gate over — both read a spec's
behaviours while approving something that refers to them. Those two changes will want the same
helper, and whichever lands second should use the first's rather than write a second one.

Reporting goes to `SessionStart` and to `harness status`. `evidence.md` F6 is the reason the hook is
named first and the command second: a notice that only speaks when asked never reached an agent that
began working immediately. The hook already carries the `contract:` line, and this is content in a
binding that already fires — bindings are 4 of 5 and the budget is not a number to raise.

`evolving-scope` B5's assertion changes from `transcript_order` on `(?i)(supersed|contradict)` to
reading the recorded link. F9 is the argument: the agent did the analysis, named `ledger B2`, and
said "evolves". The suite should grade what was recorded, not which synonym was chosen — and F13,
where a step failed on British spelling, is the same lesson bought twice.

Rejected: storing the superseded state in the superseded file. It edits an approved artifact, fires
`stale-approval`, and re-opens gate 1 on a merged change because a different change discovered
something. The spec argues this at length and the plan does not reopen it.

Rejected: a `harness supersede <slug>#<id>` verb. Verbs are 13 and every one is a thing to learn;
this is a field in a file the agent is already writing, and `spec` is the skill that tells it so.

Rejected: validating `supersedes:` in `--stage commit` instead of at approval. The link is a claim
about approved artifacts, and the moment it becomes true is the moment of approval. A commit check
would catch it later and say nothing at the point of decision.

## Files

- `.aidlc/lib/artifacts.mjs`
- `.aidlc/bin/harness`
- `.aidlc/hooks/dispatch.mjs`
- `.aidlc/skills/spec/SKILL.md`
- `.aidlc/templates/spec.md`
- `test/supersedes.test.mjs`
- `evals/tasks.json`
- `.aidlc/artifacts/a-spec-can-be-superseded/`
- `docs/OPERATING.md`

## Order

1. `test/supersedes.test.mjs` — `supersededBy` over a hand-built artifacts directory: a link from an
   approved spec is reported; a link from a draft spec is not (B5); the superseded file is
   byte-identical before and after (B3). Red first: nothing parses `supersedes:` yet.
2. `.aidlc/lib/artifacts.mjs` — parse `supersedes:`, add `supersededBy(cfg)`. Computed, never
   written, next to how `stale-approval` already works.
3. `test/supersedes.test.mjs` — validation cases: unknown slug, unapproved slug, behaviour id absent
   from the named spec. Each refused at approval, each naming what was wrong (B2).
4. `.aidlc/lib/artifacts.mjs` — the validation inside `approve()`, after the existing preconditions
   so their messages win when both apply.
5. `.aidlc/bin/harness` — `status` names superseded behaviours and what superseded them (B4).
6. `.aidlc/hooks/dispatch.mjs` — the same fact at `SessionStart`, beside the `contract:` line. No new
   binding.
7. `.aidlc/skills/spec/SKILL.md` and `.aidlc/templates/spec.md` — tell the agent the field exists and
   when to use it. F6 and F7 are both instances of a mechanism nobody used because nothing said it
   was there; this step is why they will not be a third.
8. `evals/tasks.json` — `campaign-ledger` sprint 3 asserts the recorded link rather than the
   transcript regex (B6).
9. `docs/OPERATING.md` — one paragraph: what supersession records, that it never edits the earlier
   spec, and that a superseded behaviour is still evidence of what was promised.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/supersedes.test.mjs` — an approved spec's `supersedes:` entry is reported by `supersededBy` |
| B2 | `test/supersedes.test.mjs` — unknown slug, unapproved slug and absent behaviour id are each refused at approval, naming the fault |
| B3 | `test/supersedes.test.mjs` — the superseded `spec.md` is byte-identical after, and still reports `approved` rather than `stale-approval` |
| B4 | `test/supersedes.test.mjs` — `harness status` names the superseded behaviour, and the `session-start` action carries the same fact |
| B5 | `test/supersedes.test.mjs` — a `supersedes:` entry in a draft spec supersedes nothing |
| B6 | the `campaign-ledger` re-run recorded in `.aidlc/artifacts/evolving-scope/evidence.md`: sprint 3's link is asserted, not its vocabulary |
