"""Half of a deliberate import cycle."""

from app import cycle_b


def a() -> int:
    return cycle_b.b() + 1
