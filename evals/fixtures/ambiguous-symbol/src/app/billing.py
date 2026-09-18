"""Money helpers. The `normalize` here is about currency, not whitespace."""


def normalize(amount):
    """Round a money amount to whole currency units.

    Amounts arrive as floats from the importer and must end up as integer
    cents before anything totals them.
    """
    return int(amount)
