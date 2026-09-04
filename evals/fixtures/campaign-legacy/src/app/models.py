"""Domain models for the library lending system. Plain data; the rules live in catalog.py."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional

STANDARD_LOAN_DAYS = 21


@dataclass
class Book:
    """A single title in the catalog, and how many physical copies of it exist."""

    isbn: str
    title: str
    author: str
    copies_total: int
    copies_available: int


@dataclass
class Member:
    """A person allowed to borrow books."""

    member_id: str
    name: str
    joined: date


@dataclass
class Loan:
    """One copy of one book, out to one member."""

    loan_id: str
    isbn: str
    member_id: str
    checked_out: date
    due: date
    returned: Optional[date] = None

    @property
    def is_open(self) -> bool:
        """A loan with no return date is still out."""
        return self.returned is None


@dataclass
class Hold:
    """A member's place in line for a book with no copies available right now."""

    isbn: str
    member_id: str
    requested: date
