# Plan: hyphen-titlecase

- **Date:** 2026-08-23
- **Spec:** [.claude/artifacts/spec/hyphen-titlecase.md](../spec/hyphen-titlecase.md)
- **Risk tier:** low
- **Status:** approved

## Files

```
src/app/text.py
tests/test_app.py
```

## Order of work

1. Add a failing test for the hyphen case.
2. Split on hyphens as well as spaces in titlecase().

## Proof

| Spec behaviour | Test |
|---|---|
| 1. | tests/test_app.py::test_titlecase_hyphenated |
| 2. | tests/test_app.py::test_titlecase |

## Risks

| Risk | Mitigation |
|---|---|
| Callers relying on the old output | Behaviour 2 pins the existing space handling |
