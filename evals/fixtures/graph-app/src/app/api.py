"""HTTP surface."""

from app.models import User
from app.service import greet, place_order


def handle(payload: dict) -> str:
    order = place_order(payload["name"], payload["total"])
    return greet(order.user)


def whoami(user: User) -> str:
    return user.name
