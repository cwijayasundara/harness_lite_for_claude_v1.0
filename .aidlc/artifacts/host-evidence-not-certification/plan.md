---
status: draft
---
# Plan: host-evidence-not-certification

## Approach

State the ceiling and hold it. One new test file, `test/host-evidence.test.mjs`,
reads the shipped `.aidlc/lib/review.mjs`, `.aidlc/lib/runtime-identity.mjs`,
`.aidlc/lib/product-context.mjs`, the CLI help and the guidance surfaces, and
fails when the host-review or identity surface grows a state, a verified path,
a merge verdict, an identity root, a delivery key, or a signing verb. Then say
the same thing in prose where a human reads it: the README host-review and
runtime sections, the review policy, and the lean-review row.

No library behaviour is edited. The alternative — reducing the conservative
branch-policy checks, or trimming derived host fields from the delivery
reading — is a behaviour change the review's own wording argues against, and
no defect asks for it.

The B1–B4 assertions are a lock, not a red-to-green step: they describe code
that is already correct and will pass on first run. Only the B5 guidance
assertions fail before the prose edits. Each B1–B4 assertion is verified to
fail under a deliberate local mutation of the surface it guards before that
mutation is reverted, so the lock is proved to bite.

## Files

- `test/host-evidence.test.mjs`
- `README.md`
- `.aidlc/policies/review.md`
- `docs/IMPROVEMENT-PLAN.md`

## Order

1. Add `test/host-evidence.test.mjs` with the B1–B5 assertions. Confirm B5
   fails and B1–B4 pass, then confirm each B1–B4 assertion fails under a
   temporary mutation of the surface it guards.
2. Add the limit to the README host-review section (host merge policy
   authoritative, no local merge-eligibility derivation, no signing or merge
   verb) and to the runtime/evidence section (pins and digests certify
   nothing).
3. Add one sentence to `.aidlc/policies/review.md` so a reviewer treats the
   host, not the harness, as merge authority.
4. Rewrite the lean-review host row in `docs/IMPROVEMENT-PLAN.md` to record
   the decision and what it forbids.
5. Run `harness check --stage stop`, then `--stage commit`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/host-evidence.test.mjs`: the assessment states and the single `verified` condition in `.aidlc/lib/review.mjs` are exactly the frozen set; existing `test/review.test.mjs` keeps proving each state and that simulated transport, missing policy and API failure never verify |
| B2 | `test/host-evidence.test.mjs`: CLI help and `.aidlc/bin/harness` carry no sign/attest/certify/merge/push verb, the policy downgrade conditions are unchanged, and merge identity is recorded only from the host; existing `test/review.test.mjs` covers the conservative downgrades |
| B3 | `test/host-evidence.test.mjs`: identity coverage roots, the four verify outcomes, `pinned-content` vs `git-and-content`, `authenticated: false` and `unsigned-local-observation` are unchanged; existing `test/runtime-identity.test.mjs` proves the behaviour |
| B4 | `test/host-evidence.test.mjs`: the delivery record key list and the product-context host row's `verified: false` and archived-observation limitation are unchanged; existing `test/product-context.test.mjs` proves the reading |
| B5 | `test/host-evidence.test.mjs`: README, review policy and the lean-review row state host authority, no local merge emulation and unsigned local evidence; `test/budget.test.mjs` and `test/contracts.test.mjs` still enforce unchanged `[limits]` and skill/agent counts |

## Gate status

Prepared for review. Spec and plan remain drafts. Implementation starts after
the user's `harness approve` of spec, then plan.
