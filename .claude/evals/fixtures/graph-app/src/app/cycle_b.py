"""The other half of the deliberate import cycle."""

from app import cycle_a


def b() -> int:
    return 1


def a_plus() -> int:
    return cycle_a.a()
