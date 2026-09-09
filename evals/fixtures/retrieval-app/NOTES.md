# retrieval-app

A reporting product wide enough that finding the code is the work.

Two modules export `format`: `src/billing/invoices.mjs` renders money,
`src/reporting/summary.mjs` renders a report row. A request phrased in product
language does not name either, and a lookup that stops at its first match
answers from the wrong one.

Built for the graph-first versus Grep-first comparison. The four earlier arms
all accepted 33/33 on products small enough that retrieval never mattered, so a
tie there said nothing about retrieval.
