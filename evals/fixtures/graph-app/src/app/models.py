"""Domain models. Imported by everything; imports nothing. The hub."""


class User:
    def __init__(self, name: str) -> None:
        self.name = name


class Order:
    def __init__(self, user: User, total: float) -> None:
        self.user = user
        self.total = total
