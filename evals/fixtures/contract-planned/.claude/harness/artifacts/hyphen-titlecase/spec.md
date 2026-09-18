---
status: approved
migrated_from: sha256:39704af52e8995a27a23b217b2ab3ccda37b2215f642382be57565af008a7fe1
by: fixture
at: 2026-09-01T00:00:00.000Z
digest: sha256:5941820f9a289a13b4d04f4eb0065deb9714aaf0f355267077e75362d0d1ee58
---
# Spec: hyphen-titlecase

## Outcome

Hyphenated names render with every word part capitalised while existing space handling remains.

## Observable behaviours

### B1

Given `mary-jane watson`, when `titlecase()` runs, then it returns `Mary-Jane Watson`.

### B2

Given `ada lovelace`, when `titlecase()` runs, then it continues to return `Ada Lovelace`.

## Out of scope

Apostrophes, Unicode case folding, and changes to callers.

## Safeguards

Keep the function pure and preserve existing space-separated behavior.

## Entities and existing context

A word part is a run of characters between spaces or hyphens. `src/app/text.py` owns title casing.
