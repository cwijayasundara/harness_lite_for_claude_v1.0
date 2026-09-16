# calculator

The delivery fixture. A React + TypeScript application with a real toolchain, so the capability
verbs `fmt`, `lint`, `typecheck`, `test` and `coverage` are filled by detection rather than left
empty — and so a UI defect is possible at all, which a headless Node product could never test.

It starts green and almost empty: an `App` that renders a heading, and one test that says so.
Everything else is delivered through the harness.

## Sprints

1. `calc-core` — `add` and `subtract` in `src/calc.ts`.
   `calc-ui` — the operation form in `src/App.tsx`, calling `calc.ts` and computing nothing itself.
2. `calc-ops` — `multiply` and `divide`, in the service and in the UI, with divide-by-zero refused.

## node_modules

Not committed, and not installed per run. Create it once:

```
npm ci --prefix evals/fixtures/calculator
```

`stageProduct` hard-links it into each staged copy, so a trial costs no network and no install.
The eval runner refuses by name with that command when it is missing.
