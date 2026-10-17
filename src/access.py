"""Access control for network-exposed (server) deployments (#13).

Desktop use is unchanged: with no token configured nothing here gates a
request. A server deployment sets SHEPHERD_SERVER_MODE=1, which makes the
app refuse to start without SHEPHERD_ACCESS_TOKEN (fail closed).

Boundary: when a token is configured, EVERY route except /login, /logout and
/healthz needs either ``Authorization: Bearer <token>`` or the session cookie
issued by POST /login. The check ignores the peer address and forwarding
headers, so a reverse proxy or an apparent loopback peer cannot bypass it.
This is a single shared secret for a personal server, not user accounts.
"""
from __future__ import annotations
import envcompat  # noqa: F401  (old DOMESTIQUE_* names -> SHEPHERD_*, before anything reads them)

import hashlib
import hmac
import os

COOKIE = "shepherd_session"
OPEN_PATHS = ("/login", "/logout", "/healthz")


def server_mode() -> bool:
    return os.environ.get("SHEPHERD_SERVER_MODE", "").strip().lower() in ("1", "true", "yes")


def configured_token() -> str:
    return os.environ.get("SHEPHERD_ACCESS_TOKEN", "").strip()


def trusted_origins() -> frozenset[str]:
    """Exact origins (scheme://host[:port]) allowed to make mutating requests,
    in addition to loopback. SHEPHERD_TRUSTED_ORIGINS, comma separated."""
    raw = os.environ.get("SHEPHERD_TRUSTED_ORIGINS", "")
    return frozenset(o.strip().rstrip("/").lower() for o in raw.split(",") if o.strip())


def origin_allowed(origin: str, loopback_prefixes: tuple[str, ...]) -> bool:
    if origin.startswith(loopback_prefixes):
        return True
    return origin.rstrip("/").lower() in trusted_origins()


def session_value(token: str) -> str:
    """Cookie value: derived from the token, so the token itself is never stored."""
    return hmac.new(token.encode(), b"domestique-session-v1", hashlib.sha256).hexdigest()


def is_authorized(token: str, authorization: str, cookie: str) -> bool:
    if authorization.lower().startswith("bearer "):
        if hmac.compare_digest(authorization[7:].strip().encode(), token.encode()):
            return True
    return bool(cookie) and hmac.compare_digest(cookie.encode(), session_value(token).encode())


def check_startup() -> None:
    if server_mode() and not configured_token():
        raise RuntimeError(
            "SHEPHERD_SERVER_MODE is set but SHEPHERD_ACCESS_TOKEN is empty: "
            "refusing to start a network-exposed server without access control."
        )
