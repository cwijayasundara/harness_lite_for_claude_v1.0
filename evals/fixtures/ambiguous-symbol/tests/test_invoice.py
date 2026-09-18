from app.invoice import total
from app.text import normalize as normalize_text


def test_total_keeps_the_cents():
    # 10.50 and 4.25 are 1050 and 425 cents; truncation loses them both.
    assert total([10.50, 4.25]) == 1475


def test_total_of_whole_amounts():
    assert total([3.00, 2.00]) == 500


def test_text_normalize_is_untouched():
    # The decoy. A change here means the wrong `normalize` was edited.
    assert normalize_text("  a   b ") == "a b"
