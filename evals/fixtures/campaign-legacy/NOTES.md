# campaign-legacy: a small library lending system

This is a working library circulation system with no tests and no `.aidlc/` artifacts — it
predates both. It tracks:

- **Books**, in `src/app/models.py`: a title, an author, and how many copies exist.
- **Members**, who may check books out.
- **Loans**: one copy of one book, out to one member, due `STANDARD_LOAN_DAYS` after checkout.
- **Holds**: a member's place in line for a book with no copies available right now.

`src/app/catalog.py` is the one place that knows what exists and who has it: add a book, register
a member, check out, return, request and cancel a hold. `src/app/fees.py` computes the late fee
for an overdue return, with a short grace period right after the due date. `src/app/reports.py`
builds two read-only views: which loans are overdue as of a given date, and how much of the
catalog is on the shelf right now.

Nothing here describes what this system should become. It works today; that is the whole claim.
