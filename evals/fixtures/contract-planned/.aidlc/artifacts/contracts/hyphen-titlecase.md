# Delivery contract: hyphen-titlecase

- **Schema:** aidlc.contract/v1
- **Change id:** hyphen-titlecase
- **Intent ref:** ../intent-refs/hyphen-titlecase.json
- **Story ref:** none
- **Risk:** low
- **Spec status:** approved
- **Spec approval digest:** sha256:39704af52e8995a27a23b217b2ab3ccda37b2215f642382be57565af008a7fe1
- **Plan status:** approved
- **Plan approval digest:** sha256:e041a38a3eb90a2931692c7323f3156dec6b77c5a4b113f9c30a2e4ede557946

## Outcome

Hyphenated names render with every word part capitalised while existing space handling remains.

## Observable behaviours

### B1

Given `mary-jane watson`, when `titlecase()` runs, then it returns `Mary-Jane Watson`.

### B2

Given `ada lovelace`, when `titlecase()` runs, then it continues to return `Ada Lovelace`.

## Out of scope

Apostrophes, Unicode case folding, and changes to callers.

## Entities and existing context

A word part is a run of characters between spaces or hyphens. `src/app/text.py` owns title casing.

## Approach and rejected alternatives

Split each space-separated word on hyphens and capitalize each part. A regular expression was
rejected because the required delimiters are fixed and simple.

## Structure and ownership

- `src/app/text.py`
- `tests/test_app.py`

## Safeguards

Keep the function pure and preserve existing space-separated behavior.

## Operations

1. Add a failing hyphenated-name test in `tests/test_app.py`.
2. Implement word-part capitalization in `src/app/text.py`.
3. Run `.aidlc/bin/harness check --stage commit`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `tests/test_app.py::test_titlecase_hyphenated` |
| B2 | `tests/test_app.py::test_titlecase` |
