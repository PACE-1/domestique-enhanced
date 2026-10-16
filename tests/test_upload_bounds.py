"""#18 — uploads are bounded and validated before anything is persisted."""
import asyncio
import gzip
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app as app_module
import training


class _Chunked:
    """UploadFile stand-in that counts how much of the stream was consumed."""

    def __init__(self, total):
        self.left = total
        self.read_bytes = 0

    async def read(self, n=-1):
        n = self.left if n is None or n < 0 else min(n, self.left)
        self.left -= n
        self.read_bytes += n
        return b"x" * n


@pytest.fixture
def client(monkeypatch, tmp_path):
    rides = tmp_path / "rides"
    rides.mkdir()
    monkeypatch.setattr(app_module, "_rides_fit_dir", lambda: rides)
    monkeypatch.setattr(app_module, "_maybe_auto_reforecast", lambda *a, **k: None)
    monkeypatch.setattr(training, "upload_fit_to_icu", lambda *a, **k: {"ok": False, "skipped": True})
    c = TestClient(app_module.app)
    c.rides = rides
    return c


def _valid_fit(tmp_path: Path) -> bytes:
    from test_hrtss_ingestion import _build_fit
    return _build_fit(tmp_path / "v.fit", n=60, power=200, hr=140).read_bytes()


def _post(client, name, data):
    return client.post("/api/ride/import", files={"fit_file": (name, data, "application/octet-stream")})


def test_reader_stops_at_the_limit_instead_of_buffering_everything():
    up = _Chunked(100 * 1024 * 1024)
    with pytest.raises(Exception) as e:
        asyncio.run(app_module._read_upload_limited(up, 5 * 1024 * 1024, "file"))
    assert getattr(e.value, "status_code", None) == 413
    assert up.read_bytes <= 6 * 1024 * 1024


def test_valid_fit_is_imported_atomically(client, tmp_path):
    r = _post(client, "ride.fit", _valid_fit(tmp_path))
    assert r.status_code == 200, r.text
    assert [p.suffix for p in client.rides.iterdir() if p.is_file()].count(".fit") == 1
    assert not list(client.rides.glob("*.part"))


def test_gzipped_fit_is_decompressed(client, tmp_path):
    r = _post(client, "ride.fit.gz", gzip.compress(_valid_fit(tmp_path)))
    assert r.status_code == 200, r.text
    saved = next(client.rides.glob("*.fit"))
    assert saved.read_bytes()[8:12] == b".FIT"


def test_gzip_bomb_is_rejected_before_it_is_stored(client):
    bomb = gzip.compress(b"\0" * (60 * 1024 * 1024))
    assert len(bomb) < 1024 * 1024
    r = _post(client, "ride.fit.gz", bomb)
    assert r.status_code == 413
    assert not list(client.rides.glob("*"))


def test_non_fit_content_is_rejected(client):
    r = _post(client, "ride.fit", b"this is plainly not a fit file at all, just text" * 4)
    assert r.status_code == 400 and "FIT" in r.json()["detail"]
    assert not list(client.rides.glob("*"))


def test_truncated_fit_is_not_listed_as_a_ride(client, tmp_path):
    r = _post(client, "ride.fit", _valid_fit(tmp_path)[:200])
    assert r.status_code == 422, r.text
    assert not list(client.rides.glob("*.fit"))


def test_oversized_declared_length_is_refused_up_front(client):
    r = client.post(
        "/api/wellness/import-hrv4training",
        files={"file": ("hrv.csv", b"date,rmssd\n" + b"2026-01-01,50\n" * (6 * 1024 * 1024 // 13), "text/csv")},
    )
    assert r.status_code == 413


def test_small_hrv_csv_still_imports(client):
    r = client.post(
        "/api/wellness/import-hrv4training",
        files={"file": ("hrv.csv", b"date,rmssd\n2026-01-01,52.5\n", "text/csv")},
    )
    assert r.status_code == 200 and r.json()["imported"] == 1
