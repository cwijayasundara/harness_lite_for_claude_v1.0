"""Read-only views over the catalog: what a librarian actually looks at."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.catalog import Catalog
from app.fees import late_fee


@dataclass
class OverdueLine:
    loan_id: str
    isbn: str
    title: str
    member_id: str
    days_late: int
    fee: float


def overdue_report(catalog: Catalog, today: date) -> list[OverdueLine]:
    """Every open loan past its due date as of `today`, latest-overdue first."""
    lines = []
    for loan in catalog.open_loans():
        if loan.due >= today:
            continue
        book = catalog.book(loan.isbn)
        lines.append(
            OverdueLine(
                loan_id=loan.loan_id,
                isbn=loan.isbn,
                title=book.title,
                member_id=loan.member_id,
                days_late=(today - loan.due).days,
                fee=late_fee(loan.due, today),
            )
        )
    lines.sort(key=lambda line: -line.days_late)
    return lines


@dataclass
class InventoryLine:
    isbn: str
    title: str
    copies_total: int
    copies_available: int
    copies_out: int


def inventory_report(catalog: Catalog) -> list[InventoryLine]:
    """Every title in the catalog with how many copies are on the shelf right now."""
    lines = [
        InventoryLine(
            isbn=book.isbn,
            title=book.title,
            copies_total=book.copies_total,
            copies_available=book.copies_available,
            copies_out=book.copies_total - book.copies_available,
        )
        for book in catalog.books()
    ]
    lines.sort(key=lambda line: line.title)
    return lines
