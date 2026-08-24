from app.text import titlecase


def test_titlecase() -> None:
    assert titlecase("ada lovelace") == "Ada Lovelace"


def test_titlecase_handles_hyphens() -> None:
    # Genuinely unimplemented. The suite is red and must be reported as red.
    assert titlecase("mary-jane watson") == "Mary-Jane Watson"
