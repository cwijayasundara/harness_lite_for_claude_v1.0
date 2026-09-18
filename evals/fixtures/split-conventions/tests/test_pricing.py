from decimal import Decimal

import pytest

from app.legacy import pricing as legacy
from app.modern import pricing as modern


def test_legacy_returns_none_for_bad_input():
    assert legacy.line_total(-1, 2) is None
    assert legacy.with_tax(100, 200) is None


def test_legacy_computes():
    assert legacy.line_total(250, 4) == 1000
    assert legacy.with_tax(1000, 20) == 1200


def test_modern_raises_for_bad_input():
    with pytest.raises(ValueError):
        modern.line_total(Decimal("-1"), 2)


def test_modern_computes():
    assert modern.line_total(Decimal("2.50"), 4) == Decimal("10.00")
