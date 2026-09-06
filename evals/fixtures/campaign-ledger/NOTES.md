# campaign-ledger: a small invoicing ledger

This is a working invoicing ledger with one smoke test and no `.aidlc/` artifacts — it predates
both. Plain Node.js, no packages. It tracks:

- **Customers**, in `src/ledger.mjs`: `addCustomer(name)` returns a numeric id.
- **Invoices**: `addInvoice(customerId, amountCents, dueDate)` records an amount in integer cents
  against a known customer and returns a numeric id; an unknown customer is refused.
  `listInvoices(customerId)` returns that customer's invoices.
- **Late fees**, in `src/fees.mjs`: `lateFeeCents(dueDate, paidDate)` with a short grace period
  right after the due date, a daily rate, and a cap.

Everything lives in memory for the life of the process. `tests/smoke.test.mjs` only checks that
the modules load.

Nothing here describes what this system should become. It works today; that is the whole claim.
