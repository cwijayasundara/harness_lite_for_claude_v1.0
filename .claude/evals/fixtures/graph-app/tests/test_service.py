from app.service import place_order


def test_place_order() -> None:
    order = place_order("ada", 10.0)
    assert order.user.name == "ada"
