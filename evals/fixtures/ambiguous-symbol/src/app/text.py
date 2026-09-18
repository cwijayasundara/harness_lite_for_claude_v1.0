"""Display helpers. The `normalize` here is about whitespace, not money."""


def normalize(value):
    """Collapse runs of whitespace so labels compare equal."""
    return " ".join(str(value).split())
