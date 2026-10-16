"""#13 — optional access control for server deployments."""
import pytest
from fastapi.testclient import TestClient

import access
import app as app_module

TOKEN = "s3cret-token"


@pytest.fixture
def served(monkeypatch):
    monkeypatch.setenv("DOMESTIQUE_ACCESS_TOKEN", TOKEN)
    monkeypatch.delenv("DOMESTIQUE_TRUSTED_ORIGINS", raising=False)
    return TestClient(app_module.app, follow_redirects=False)


def test_without_a_token_nothing_is_gated(monkeypatch):
    monkeypatch.delenv("DOMESTIQUE_ACCESS_TOKEN", raising=False)
    c = TestClient(app_module.app, follow_redirects=False)
    assert c.get("/api/version").status_code == 200


def test_api_requires_authentication(served):
    r = served.get("/api/version")
    assert r.status_code == 401 and r.json() == {"error": "authentication required"}
    assert served.post("/api/profiles/switch", json={"id": "x"}).status_code == 401


def test_browser_navigation_redirects_to_login(served):
    r = served.get("/")
    assert r.status_code == 303 and r.headers["location"] == "/login"


def test_bearer_token_authorises(served):
    ok = served.get("/api/version", headers={"Authorization": f"Bearer {TOKEN}"})
    bad = served.get("/api/version", headers={"Authorization": "Bearer nope"})
    assert ok.status_code == 200 and bad.status_code == 401


def test_login_sets_an_httponly_strict_cookie_that_works(served):
    wrong = served.post("/login", data={"token": "nope"})
    assert wrong.status_code == 401 and "domestique_session" not in wrong.headers.get("set-cookie", "")
    r = served.post("/login", data={"token": TOKEN})
    assert r.status_code == 303 and r.headers["location"] == "/"
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie
    assert TOKEN not in r.headers["set-cookie"]          # derived value, never the token
    served.cookies.set("domestique_session", access.session_value(TOKEN))
    assert served.get("/api/version").status_code == 200


def test_forwarding_headers_do_not_bypass_the_gate(served):
    r = served.get("/api/version", headers={"X-Forwarded-For": "127.0.0.1", "X-Real-IP": "127.0.0.1",
                                            "Forwarded": "for=127.0.0.1"})
    assert r.status_code == 401


def test_identity_headers_from_an_oidc_proxy_do_not_authenticate(served):
    # A proxy in front (Pocket ID, oauth2-proxy) identifies the rider with headers;
    # the app trusts only the bearer token the proxy injects (docs/SERVER.md).
    ident = {"X-Forwarded-User": "isaac", "Remote-User": "isaac", "X-Forwarded-Proto": "https"}
    assert served.get("/api/version", headers=ident).status_code == 401
    ok = served.get("/api/version", headers={**ident, "Authorization": f"Bearer {TOKEN}"})
    assert ok.status_code == 200


def test_healthz_is_open(served):
    assert served.get("/healthz").json() == {"ok": True}


def test_trusted_origin_is_exact(monkeypatch, served):
    served.cookies.set("domestique_session", access.session_value(TOKEN))
    body = {"id": "does-not-exist"}
    evil = served.post("/api/profiles/switch", json=body, headers={"Origin": "https://train.example.com"})
    assert evil.status_code == 403
    monkeypatch.setenv("DOMESTIQUE_TRUSTED_ORIGINS", "https://train.example.com")
    ok = served.post("/api/profiles/switch", json=body, headers={"Origin": "https://train.example.com"})
    assert ok.status_code != 403
    other = served.post("/api/profiles/switch", json=body, headers={"Origin": "https://train.example.com.evil.io"})
    assert other.status_code == 403


def test_server_mode_without_a_token_refuses_to_start(monkeypatch):
    monkeypatch.setenv("DOMESTIQUE_SERVER_MODE", "1")
    monkeypatch.delenv("DOMESTIQUE_ACCESS_TOKEN", raising=False)
    with pytest.raises(RuntimeError, match="refusing to start"):
        with TestClient(app_module.app):
            pass


def test_server_mode_with_a_token_starts(monkeypatch):
    monkeypatch.setenv("DOMESTIQUE_SERVER_MODE", "1")
    monkeypatch.setenv("DOMESTIQUE_ACCESS_TOKEN", TOKEN)
    with TestClient(app_module.app) as c:
        assert c.get("/healthz").status_code == 200
