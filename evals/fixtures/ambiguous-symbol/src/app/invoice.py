"""Invoice totalling. Uses the billing helper, not the text one."""

from app.billing import normalize


def total(lines):
    """Total a list of line amounts, in cents."""
    return sum(normalize(line) for line in lines)
