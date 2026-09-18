"""Modern pricing. Callers here expect exceptions and Decimal amounts."""

from decimal import Decimal


def line_total(amount: Decimal, quantity: int) -> Decimal:
    if amount < 0:
        raise ValueError("amount must not be negative")
    if quantity < 0:
        raise ValueError("quantity must not be negative")
    return amount * quantity


def with_tax(amount: Decimal, rate_percent: Decimal) -> Decimal:
    if amount < 0:
        raise ValueError("amount must not be negative")
    if not 0 <= rate_percent <= 100:
        raise ValueError("rate_percent must be between 0 and 100")
    return amount + (amount * rate_percent / Decimal(100))
