import re
from pathlib import Path

import pytest

from app.species import SPECIES, noun, plural

FRONTEND_LIST = Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib" / "species.ts"


def test_frontend_species_list_matches():
    """frontend/src/lib/species.ts mirrors app/species.py: same ids, order, nouns and plurals."""
    if not FRONTEND_LIST.exists():
        pytest.skip("frontend not checked out next to the backend")
    source = FRONTEND_LIST.read_text(encoding="utf-8")
    entries = re.findall(r'\{ id: "([^"]+)", noun: "([^"]+)", plural: "([^"]+)"', source)
    assert entries == [(k, n, p) for k, (n, p) in SPECIES.items()]


def test_nouns():
    assert noun("guinea-pig") == "guinea pig" and plural("mouse") == "mice" and plural("fish") == "fish"
    assert noun("cat") == "cat" and plural("cat") == "cats"
