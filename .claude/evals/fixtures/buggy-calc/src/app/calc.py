"""Integer division."""


def divide(a: int, b: int) -> int:
    """Divide a by b, truncating toward zero."""
    if b == 0:
        raise ZeroDivisionError("b must not be zero")
    # BUG: floor division rounds toward negative infinity, not toward zero.
    return a // b
