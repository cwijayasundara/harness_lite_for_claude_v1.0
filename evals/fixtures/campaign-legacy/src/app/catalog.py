"""The catalog: the one place that knows what exists and who has it."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from app.models import Book, Hold, Loan, Member, STANDARD_LOAN_DAYS


class CatalogError(ValueError):
    """Raised for any operation the catalog's own rules refuse."""


class Catalog:
    """In-memory library state. No persistence — this is the whole system's storage layer."""

    def __init__(self) -> None:
        self._books: dict[str, Book] = {}
        self._members: dict[str, Member] = {}
        self._loans: dict[str, Loan] = {}
        self._holds: list[Hold] = []
        self._next_loan_id = 1

    # -- inventory -----------------------------------------------------------

    def add_book(self, isbn: str, title: str, author: str, copies: int) -> Book:
        if isbn in self._books:
            raise CatalogError(f"{isbn} is already in the catalog")
        if copies < 1:
            raise CatalogError("a book needs at least one copy")
        book = Book(
            isbn=isbn,
            title=title,
            author=author,
            copies_total=copies,
            copies_available=copies,
        )
        self._books[isbn] = book
        return book

    def book(self, isbn: str) -> Book:
        try:
            return self._books[isbn]
        except KeyError:
            raise CatalogError(f"no book {isbn}") from None

    def books(self) -> list[Book]:
        """Every title in the catalog, in the order it was added."""
        return list(self._books.values())

    def find_by_title(self, needle: str) -> list[Book]:
        needle = needle.lower()
        return [b for b in self._books.values() if needle in b.title.lower()]

    # -- membership ------------------------------------------------------------

    def register_member(self, member_id: str, name: str, joined: date) -> Member:
        if member_id in self._members:
            raise CatalogError(f"{member_id} is already registered")
        member = Member(member_id=member_id, name=name, joined=joined)
        self._members[member_id] = member
        return member

    def member(self, member_id: str) -> Member:
        try:
            return self._members[member_id]
        except KeyError:
            raise CatalogError(f"no member {member_id}") from None

    # -- checkout / return -------------------------------------------------------

    def checkout(self, isbn: str, member_id: str, today: date) -> Loan:
        """Hand one copy of `isbn` to `member_id`, due STANDARD_LOAN_DAYS from `today`."""
        book = self.book(isbn)
        self.member(member_id)  # raises if the member is unknown
        if book.copies_available < 1:
            raise CatalogError(f"{isbn} has no copies available")
        loan_id = f"L{self._next_loan_id:05d}"
        self._next_loan_id += 1
        loan = Loan(
            loan_id=loan_id,
            isbn=isbn,
            member_id=member_id,
            checked_out=today,
            due=today + timedelta(days=STANDARD_LOAN_DAYS),
        )
        self._loans[loan_id] = loan
        book.copies_available -= 1
        return loan

    def return_book(self, loan_id: str, today: date) -> Loan:
        loan = self.loan(loan_id)
        if not loan.is_open:
            raise CatalogError(f"{loan_id} was already returned")
        loan.returned = today
        self.book(loan.isbn).copies_available += 1
        return loan

    def loan(self, loan_id: str) -> Loan:
        try:
            return self._loans[loan_id]
        except KeyError:
            raise CatalogError(f"no loan {loan_id}") from None

    def open_loans(self) -> list[Loan]:
        """Every loan that has not been returned yet."""
        return [loan for loan in self._loans.values() if loan.is_open]

    def open_loans_for_member(self, member_id: str) -> list[Loan]:
        return [loan for loan in self.open_loans() if loan.member_id == member_id]

    def loan_history_for_member(self, member_id: str) -> list[Loan]:
        """Every loan a member has ever had, open or returned, oldest first."""
        return sorted(
            (loan for loan in self._loans.values() if loan.member_id == member_id),
            key=lambda loan: loan.checked_out,
        )

    # -- holds -----------------------------------------------------------------

    def request_hold(self, isbn: str, member_id: str, today: date) -> Hold:
        """Queue `member_id` for the next available copy of `isbn`."""
        self.book(isbn)
        self.member(member_id)
        if any(h.isbn == isbn and h.member_id == member_id for h in self._holds):
            raise CatalogError(f"{member_id} already holds a place in line for {isbn}")
        hold = Hold(isbn=isbn, member_id=member_id, requested=today)
        self._holds.append(hold)
        return hold

    def cancel_hold(self, isbn: str, member_id: str) -> None:
        before = len(self._holds)
        self._holds = [h for h in self._holds if not (h.isbn == isbn and h.member_id == member_id)]
        if len(self._holds) == before:
            raise CatalogError(f"{member_id} holds no place in line for {isbn}")

    def holds_for(self, isbn: str) -> list[Hold]:
        """Everyone waiting for a copy of `isbn`, in request order."""
        return sorted((h for h in self._holds if h.isbn == isbn), key=lambda h: h.requested)

    def next_hold(self, isbn: str) -> Optional[Hold]:
        """Whoever is first in line for `isbn`, if anyone is waiting."""
        holds = self.holds_for(isbn)
        return holds[0] if holds else None
