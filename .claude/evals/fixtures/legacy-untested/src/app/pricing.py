"""Pricing. No tests cover this module — that is the point of the fixture."""

TAX_RATE = 0.2


def total(net: float, discount_pct: float = 0.0) -> float:
    """Apply the discount, then tax."""
    discounted = net * (1 - discount_pct / 100)
    return round(discounted * (1 + TAX_RATE), 2)
