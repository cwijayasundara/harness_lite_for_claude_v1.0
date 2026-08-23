"""Short-code encoding for link IDs."""

ALPHABET = "23456789abcdefghijkmnpqrstuvwxyz"


def encode(link_id: int) -> str:
    """Encode a positive integer id as a short code."""
    if link_id <= 0:
        raise ValueError("link_id must be positive")
    out = ""
    while link_id:
        link_id, rem = divmod(link_id, len(ALPHABET))
        out = ALPHABET[rem] + out
    return out


def decode(code: str) -> int:
    """Decode a short code back to its integer id."""
    if not code:
        raise ValueError("code must not be empty")
    total = 0
    for ch in code:
        total = total * len(ALPHABET) + ALPHABET.index(ch)
    return total
