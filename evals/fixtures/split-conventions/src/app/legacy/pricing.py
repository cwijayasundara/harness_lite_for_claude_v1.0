"""Legacy pricing. Callers here are old batch jobs that cannot handle exceptions:
every function returns None for input it cannot use, and amounts are integer cents.
"""


def line_total(amount_cents, quantity):
    if not isinstance(amount_cents, int) or amount_cents < 0:
        return None
    if not isinstance(quantity, int) or quantity < 0:
        return None
    return amount_cents * quantity


def with_tax(amount_cents, rate_percent):
    if not isinstance(amount_cents, int) or amount_cents < 0:
        return None
    if not isinstance(rate_percent, int) or not 0 <= rate_percent <= 100:
        return None
    return amount_cents + (amount_cents * rate_percent) // 100
