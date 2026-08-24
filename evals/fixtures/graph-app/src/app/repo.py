"""Persistence."""

from app.models import Order, User

_USERS: dict[str, User] = {}
_ORDERS: list[Order] = []


def find_user(name: str) -> User:
    if name not in _USERS:
        _USERS[name] = User(name)
    return _USERS[name]


def save_order(user: User, total: float) -> Order:
    order = Order(user, total)
    _ORDERS.append(order)
    return order
