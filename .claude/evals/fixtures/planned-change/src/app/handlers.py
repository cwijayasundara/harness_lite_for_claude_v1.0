"""Request handlers."""

from app.text import titlecase


def render_name(payload: dict) -> str:
    """Validate the payload and render a display name."""
    if not isinstance(payload, dict):
        raise TypeError("payload must be a dict")
    name = payload.get("name")
    if not name:
        raise ValueError("name is required")
    if len(name) > 200:
        raise ValueError("name too long")
    return titlecase(name)
