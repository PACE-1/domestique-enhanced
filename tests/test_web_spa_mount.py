"""web_spa.mount_spa serves a compiled React build under /v2 and nothing without one."""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from web_spa import mount_spa


def test_mount_serves_index_under_prefix(tmp_path):
    (tmp_path / "index.html").write_text("<html>spa</html>")
    app = FastAPI()
    assert mount_spa(app, tmp_path) is True
    r = TestClient(app).get("/v2/")
    assert r.status_code == 200 and "spa" in r.text


def test_no_build_means_no_mount(tmp_path):
    app = FastAPI()
    assert mount_spa(app, tmp_path) is False
    assert TestClient(app).get("/v2/").status_code == 404
