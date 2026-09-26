"""Match messy estimate line names ("CBC w/ diff") to catalog items."""

from .. import store


def _norm(s: str) -> str:
    return "".join(ch for ch in s.lower() if ch.isalnum())


def match_catalog_id(raw_name: str) -> str | None:
    # TODO: fuzzy matching (rapidfuzz) or ask Claude when no exact alias hit.
    key = _norm(raw_name)
    for item in store.catalog().values():
        if key in {_norm(item.name), _norm(item.code), *map(_norm, item.aliases)}:
            return item.id
    return None
