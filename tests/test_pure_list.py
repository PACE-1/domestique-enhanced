"""tests/pure_files.txt stays honest (#8): every entry exists and none imports the app."""
import re
from pathlib import Path

TESTS = Path(__file__).resolve().parent
_HEAVY = re.compile(r"^\s*(import app\b|from app import|import launcher\b|from launcher import|"
                    r"from fastapi|import fastapi|from conftest import|import conftest)", re.M)


def _entries():
    return [l.strip() for l in (TESTS / "pure_files.txt").read_text().splitlines() if l.strip()]


def test_every_listed_file_exists():
    missing = [f for f in _entries() if not (TESTS / f).is_file()]
    assert missing == []


def test_no_listed_file_imports_the_app_or_the_conftest():
    offenders = [f for f in _entries() if _HEAVY.search((TESTS / f).read_text(errors="ignore"))]
    assert offenders == [], f"not pure: {offenders}"


def test_list_is_sorted_and_unique():
    e = _entries()
    assert e == sorted(set(e))
