"""AI coach: the stored connection, the two wire formats, and the insight endpoints."""
import json
import os
import stat
from unittest import mock

import httpx
import pytest
from fastapi.testclient import TestClient

import app as app_module
import llm


class _Resp:
    def __init__(self, status=200, data=None, text=""):
        self.status_code, self._data, self.text = status, data, text

    def json(self):
        if self._data is None:
            raise ValueError("no json")
        return self._data


def test_save_stores_a_private_file_and_public_never_returns_the_key(tmp_path):
    cfg = llm.save(tmp_path, "openai", "http://localhost:11434/v1/", "llama3", "sk-secret")
    assert cfg["base_url"] == "http://localhost:11434/v1"
    assert stat.S_IMODE(os.stat(tmp_path / "llm.json").st_mode) == 0o600
    pub = llm.public(llm.load(tmp_path))
    assert pub == {"configured": True, "provider": "openai", "base_url": "http://localhost:11434/v1",
                   "model": "llama3", "has_key": True}
    assert "sk-secret" not in json.dumps(pub)


def test_saving_without_a_key_keeps_the_stored_one_and_empty_means_none(tmp_path):
    llm.save(tmp_path, "openai", "", "gpt-x", "sk-1")
    assert llm.save(tmp_path, "openai", "", "gpt-y", None)["api_key"] == "sk-1"
    assert llm.load(tmp_path)["base_url"] == "https://api.openai.com/v1"
    assert llm.save(tmp_path, "openai", "http://localhost:1234/v1", "m", "")["api_key"] == ""


@pytest.mark.parametrize("args", [
    ("nope", "", "m", "k"), ("openai", "", "", "k"), ("openai", "ftp://x", "m", "k"),
    ("anthropic", "", "m", ""), ("openai", "", "m", "a\nb"),
])
def test_save_rejects_bad_input(tmp_path, args):
    with pytest.raises(ValueError):
        llm.save(tmp_path, *args)
    assert llm.load(tmp_path) == {}


def test_clear_removes_the_connection(tmp_path):
    llm.save(tmp_path, "openai", "", "m", "k")
    llm.clear(tmp_path)
    llm.clear(tmp_path)
    assert llm.load(tmp_path) == {}


def test_anthropic_request_and_reply():
    cfg = {"provider": "anthropic", "base_url": "https://api.anthropic.com", "model": "claude-x", "api_key": "k"}
    with mock.patch.object(llm.httpx, "post", return_value=_Resp(data={"content": [{"type": "text", "text": " hi "}]})) as p:
        assert llm.complete(cfg, "sys", [{"role": "user", "content": "q"}]) == "hi"
    assert p.call_args.args[0] == "https://api.anthropic.com/v1/messages"
    assert p.call_args.kwargs["headers"]["x-api-key"] == "k"
    assert p.call_args.kwargs["json"]["system"] == "sys"


def test_openai_request_reply_and_keyless_local():
    cfg = {"provider": "openai", "base_url": "http://localhost:11434/v1", "model": "llama3", "api_key": ""}
    with mock.patch.object(llm.httpx, "post", return_value=_Resp(data={"choices": [{"message": {"content": "ok"}}]})) as p:
        assert llm.complete(cfg, "sys", [{"role": "user", "content": "q"}]) == "ok"
    assert p.call_args.args[0] == "http://localhost:11434/v1/chat/completions"
    assert p.call_args.kwargs["headers"] == {}
    assert p.call_args.kwargs["json"]["messages"][0] == {"role": "system", "content": "sys"}


@pytest.mark.parametrize("resp,fragment", [
    (_Resp(401), "rejected the API key"),
    (_Resp(429, {"error": {"message": "slow down"}}), "429: slow down"),
    (_Resp(500, text="boom"), "500: boom"),
    (_Resp(200, {"nope": 1}), "not in the expected format"),
    (_Resp(200, {"choices": [{"message": {"content": "  "}}]}), "empty reply"),
])
def test_provider_failures_become_readable_errors(resp, fragment):
    cfg = {"provider": "openai", "base_url": "http://x/v1", "model": "m", "api_key": "k"}
    with mock.patch.object(llm.httpx, "post", return_value=resp):
        with pytest.raises(llm.LlmError, match=fragment):
            llm.complete(cfg, "s", [{"role": "user", "content": "q"}])


def test_unreachable_provider_and_no_provider():
    cfg = {"provider": "openai", "base_url": "http://x/v1", "model": "m", "api_key": ""}
    with mock.patch.object(llm.httpx, "post", side_effect=httpx.ConnectError("down")):
        with pytest.raises(llm.LlmError, match="Could not reach http://x/v1: ConnectError"):
            llm.complete(cfg, "s", [])
    with pytest.raises(llm.LlmError, match="No AI provider"):
        llm.complete({}, "s", [])


@pytest.fixture
def c():
    with TestClient(app_module.app) as client:
        yield client


def test_connection_endpoints_round_trip_without_leaking_the_key(c):
    assert c.get("/api/llm").json()["configured"] is False
    r = c.post("/api/llm", json={"provider": "openai", "base_url": "http://localhost:11434/v1", "model": "m", "api_key": "sk-zzz"})
    assert r.status_code == 200 and r.json()["has_key"] is True and "sk-zzz" not in r.text
    assert "sk-zzz" not in c.get("/api/llm").text
    assert c.post("/api/llm", json={"provider": "bad", "model": "m"}).status_code == 400
    assert c.delete("/api/llm").json()["configured"] is False


def test_insight_endpoints_call_the_model_with_the_riders_numbers(c):
    c.post("/api/llm", json={"provider": "openai", "base_url": "http://localhost:11434/v1", "model": "m"})
    try:
        with mock.patch.object(llm, "complete", return_value="Keep it easy.") as comp:
            w = c.post("/api/insights/week", json={})
            assert w.status_code == 200 and w.json() == {"text": "Keep it easy.", "model": "m"}
            sent = comp.call_args.args[2][-1]["content"]
            assert "tss_done" in sent and "fitness_last_14_days" in sent
            a = c.post("/api/insights/ask", json={"question": "Am I overreaching?", "history": [
                {"role": "user", "content": "hi"}, {"role": "system", "content": "ignored"}]})
            assert a.status_code == 200
            msgs = comp.call_args.args[2]
            assert [m["role"] for m in msgs] == ["user", "user"]
            assert msgs[-1]["content"].endswith("Question: Am I overreaching?")
        assert c.post("/api/insights/ask", json={"question": " "}).status_code == 400
        assert c.post("/api/insights/week", json={"week_offset": 3}).status_code == 400
    finally:
        c.delete("/api/llm")


def test_insights_without_a_provider_and_a_failing_provider_are_502(c):
    c.delete("/api/llm")
    r = c.post("/api/insights/ask", json={"question": "hi"})
    assert r.status_code == 502 and "No AI provider" in r.json()["detail"]
    assert c.post("/api/llm/test").status_code == 502


def test_a_new_provider_or_address_never_inherits_the_saved_key(tmp_path):
    llm.save(tmp_path, "anthropic", "", "claude-x", "sk-secret")
    with pytest.raises(ValueError, match="Enter the API key"):
        llm.save(tmp_path, "openai", "http://evil.example/v1", "m", None)
    with pytest.raises(ValueError, match="Enter the API key"):
        llm.save(tmp_path, "anthropic", "https://other.example", "claude-x", None)
    assert llm.load(tmp_path)["api_key"] == "sk-secret" and llm.load(tmp_path)["base_url"] == "https://api.anthropic.com"
    # Same provider and address, new model: the key is kept.
    assert llm.save(tmp_path, "anthropic", "", "claude-y", None)["api_key"] == "sk-secret"
    # Switching to a keyless local server is fine and carries no key.
    llm.save(tmp_path, "openai", "http://localhost:11434/v1", "llama3", "")
    assert llm.save(tmp_path, "openai", "http://localhost:11434/v1", "llama3", None)["api_key"] == ""


def test_the_slow_model_call_runs_in_a_worker_thread_and_a_missing_ride_is_a_404(c):
    from fastapi.concurrency import run_in_threadpool

    c.post("/api/llm", json={"provider": "openai", "base_url": "http://localhost:11434/v1", "model": "m"})
    offloaded = []

    async def spy(fn, *args, **kwargs):
        offloaded.append(fn.__name__)
        return await run_in_threadpool(fn, *args, **kwargs)

    try:
        with mock.patch.object(app_module, "run_in_threadpool", spy), mock.patch.object(llm, "complete", return_value="ok"):
            assert c.post("/api/insights/week", json={}).status_code == 200
            assert c.post("/api/insights/ask", json={"question": "hi"}).status_code == 200
        assert offloaded == ["work", "work"]
        gone = c.post("/api/insights/ride/does-not-exist")
        assert gone.status_code == 404, gone.text
    finally:
        c.delete("/api/llm")
