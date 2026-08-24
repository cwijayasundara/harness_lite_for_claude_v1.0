import pytest

from app.calc import divide


@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [(7, 2, 3), (-7, 2, -3), (7, -2, -3), (-7, -2, 3)],
)
def test_divide_truncates_toward_zero(a: int, b: int, expected: int) -> None:
    assert divide(a, b) == expected


def test_divide_by_zero() -> None:
    with pytest.raises(ZeroDivisionError):
        divide(1, 0)
