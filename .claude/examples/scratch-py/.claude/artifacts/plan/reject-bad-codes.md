# Plan: reject-bad-codes

- **Date:** 2026-08-23
- **Spec:** [.claude/artifacts/spec/reject-bad-codes.md](../spec/reject-bad-codes.md)
- **Risk tier:** standard <!-- low | standard | critical -->
- **Status:** approved

## Files

Every path this change touches. `harness check --stage commit` compares the diff against this
list — if they disagree, update this block in the same commit or revert the change.

```
src/shortlink/codec.py
tests/test_codec.py
```

## Order of work

1.

## Proof

Which test demonstrates each spec behaviour. "Tests pass" is not proof; name the test.

| Spec behaviour | Test |
|---|---|
| 1. | tests/test_codec.py::test_rejects_empty_code |
| 2. | tests/test_codec.py::test_roundtrip |

## Risks

| Risk | Mitigation |
|---|---|
