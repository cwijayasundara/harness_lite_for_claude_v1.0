"""Late-fee calculation for overdue returns."""

from __future__ import annotations

from datetime import date

DAILY_RATE = 0.25
MAX_FEE = 15.00
GRACE_DAYS = 3  # a loan returned within this many days of its due date owes nothing


def days_late(due: date, returned: date) -> int:
    """How many days after `due` a book came back. Never negative."""
    return max(0, (returned - due).days)


def late_fee(due: date, returned: date) -> float:
    """The fee owed for one loan, in dollars, capped at MAX_FEE.

    The first GRACE_DAYS days late are free — a member back a day or two after the due date
    should not be nickel-and-dimed. Fees accrue at DAILY_RATE per day past the grace window.
    """
    late = days_late(due, returned)
    if late == 0:
        return 0.0
    if late < GRACE_DAYS:
        return 0.0
    billable_days = late - GRACE_DAYS + 1
    return round(min(billable_days * DAILY_RATE, MAX_FEE), 2)
