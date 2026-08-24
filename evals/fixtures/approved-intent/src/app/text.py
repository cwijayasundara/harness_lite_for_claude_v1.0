"""Text helpers."""


def titlecase(value: str) -> str:
    """Capitalise the first letter of every word."""
    return " ".join(word[:1].upper() + word[1:] for word in value.split(" "))
