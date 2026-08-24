"""Text helpers."""


def titlecase(value: str) -> str:
    """Capitalise the first letter of every word part (spaces and hyphens)."""
    return " ".join(
        "-".join(part[:1].upper() + part[1:] for part in word.split("-"))
        for word in value.split(" ")
    )
