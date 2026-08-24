import pytest

from app.handlers import render_name
from app.text import titlecase


def test_titlecase() -> None:
    assert titlecase("ada lovelace") == "Ada Lovelace"


def test_render_name_requires_name() -> None:
    with pytest.raises(ValueError):
        render_name({})


def test_render_name() -> None:
    assert render_name({"name": "grace hopper"}) == "Grace Hopper"
