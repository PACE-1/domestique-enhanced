"""Model provider connection for training insights.

One stored connection per profile (``<profile>/llm.json``, mode 0600) and one
call, ``complete``. Two wire formats cover the field: Anthropic's Messages API,
and the OpenAI chat-completions shape that OpenAI, OpenRouter, Ollama, LM
Studio and opencode servers all speak. No SDK: httpx is already a dependency.

Nothing here knows about rides or plans; ``app`` builds the prompt context.
"""
import json
from pathlib import Path

import httpx

from atomic_io import write_text_atomic
from http_util import _icu_verify

PROVIDERS = ("anthropic", "openai")
DEFAULT_BASE = {"anthropic": "https://api.anthropic.com", "openai": "https://api.openai.com/v1"}
TIMEOUT_S = 90
MAX_TOKENS = 900


class LlmError(Exception):
    """A failure the rider can act on; the message is safe to show."""


def _path(profile_dir: Path) -> Path:
    return Path(profile_dir) / "llm.json"


def load(profile_dir: Path) -> dict:
    """The stored connection, or {} when none is saved."""
    try:
        d = json.loads(_path(profile_dir).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return d if isinstance(d, dict) and d.get("provider") in PROVIDERS and d.get("model") else {}


def public(cfg: dict) -> dict:
    """What the interface may see: everything except the key."""
    return {
        "configured": bool(cfg),
        "provider": cfg.get("provider", ""),
        "base_url": cfg.get("base_url", ""),
        "model": cfg.get("model", ""),
        "has_key": bool(cfg.get("api_key")),
    }


def save(profile_dir: Path, provider: str, base_url: str, model: str, api_key: "str | None") -> dict:
    """Validate and store a connection. ``api_key`` None keeps the stored key."""
    provider = (provider or "").strip()
    base_url = (base_url or "").strip().rstrip("/")
    model = (model or "").strip()
    if provider not in PROVIDERS:
        raise ValueError("provider must be 'anthropic' or 'openai'")
    if not model:
        raise ValueError("model is required")
    if not base_url:
        base_url = DEFAULT_BASE[provider]
    if not base_url.startswith(("http://", "https://")):
        raise ValueError("base URL must start with http:// or https://")
    key = load(profile_dir).get("api_key", "") if api_key is None else (api_key or "").strip()
    if any(c in key for c in "\r\n"):
        raise ValueError("API key may not contain newlines")
    if provider == "anthropic" and not key:
        raise ValueError("an API key is required for Anthropic")
    cfg = {"provider": provider, "base_url": base_url, "model": model, "api_key": key}
    write_text_atomic(_path(profile_dir), json.dumps(cfg, indent=2), mode=0o600)
    return cfg


def clear(profile_dir: Path) -> None:
    try:
        _path(profile_dir).unlink()
    except FileNotFoundError:
        pass


def complete(cfg: dict, system: str, messages: list[dict], max_tokens: int = MAX_TOKENS) -> str:
    """One reply from the stored model. ``messages``: [{"role": "user"|"assistant", "content": str}]."""
    if not cfg:
        raise LlmError("No AI provider is connected. Add one in Settings.")
    base = cfg["base_url"]
    key = cfg.get("api_key", "")
    if cfg["provider"] == "anthropic":
        url = f"{base}/v1/messages"
        headers = {"x-api-key": key, "anthropic-version": "2023-06-01"}
        body = {"model": cfg["model"], "max_tokens": max_tokens, "system": system, "messages": messages}
    else:
        url = f"{base}/chat/completions"
        headers = {"Authorization": f"Bearer {key}"} if key else {}
        body = {"model": cfg["model"], "max_tokens": max_tokens,
                "messages": [{"role": "system", "content": system}, *messages]}
    try:
        r = httpx.post(url, json=body, headers=headers, timeout=TIMEOUT_S, verify=_icu_verify())
    except httpx.HTTPError as e:
        raise LlmError(f"Could not reach {base}: {e.__class__.__name__}") from e
    if r.status_code in (401, 403):
        raise LlmError("The provider rejected the API key.")
    if r.status_code >= 400:
        try:
            err = r.json().get("error")
            detail = err.get("message") if isinstance(err, dict) else err
        except ValueError:
            detail = None
        raise LlmError(f"The provider returned {r.status_code}: {str(detail or r.text)[:200]}")
    try:
        data = r.json()
        if cfg["provider"] == "anthropic":
            text = "".join(b.get("text", "") for b in data["content"] if b.get("type") == "text")
        else:
            text = data["choices"][0]["message"]["content"] or ""
    except (ValueError, KeyError, IndexError, TypeError) as e:
        raise LlmError("The provider's reply was not in the expected format.") from e
    if not text.strip():
        raise LlmError("The model returned an empty reply.")
    return text.strip()
