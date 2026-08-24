"""Application service."""

from app.models import User
from app.repo import find_user, save_order


def place_order(name: str, total: float):
    user = find_user(name)
    return save_order(user, total)


def greet(user: User) -> str:
    return f"hello {user.name}"
