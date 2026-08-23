import pytest

from shortlink.codec import decode, encode


@pytest.mark.parametrize("link_id", [1, 31, 32, 1000, 999_999])
def test_roundtrip(link_id: int) -> None:
    assert decode(encode(link_id)) == link_id


def test_rejects_non_positive() -> None:
    with pytest.raises(ValueError):
        encode(0)


def test_rejects_empty_code() -> None:
    with pytest.raises(ValueError):
        decode("")
