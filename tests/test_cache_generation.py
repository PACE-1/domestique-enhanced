"""#6 — a fill that started before an invalidation never repopulates the cache."""
import threading

import cache


def _reset():
    cache.clear_cache()
    cache._locks.clear()


def test_fill_in_flight_during_clear_is_not_published():
    """The audit's probe: pause a fill returning profile A, clear, release the
    fill, then request with a profile-B loader. The result must be B."""
    _reset()
    in_fill, release = threading.Event(), threading.Event()

    def loader_a():
        in_fill.set()
        assert release.wait(5)
        return {"profile": "A"}

    first = {}

    def run_first():
        first["value"] = cache.cached("training", loader_a)

    t = threading.Thread(target=run_first)
    t.start()
    assert in_fill.wait(5)
    cache.clear_cache()                  # profile switch while the fill runs
    release.set()
    t.join(5)
    assert first["value"] == {"profile": "A"}   # the caller that asked pre-switch got what it asked for
    # ... but it was not published: the next request loads for profile B.
    assert cache.cached("training", lambda: {"profile": "B"}) == {"profile": "B"}


def test_normal_fill_is_published_and_served_from_cache():
    _reset()
    calls = []
    assert cache.cached("k", lambda: calls.append(1) or {"v": 1}) == {"v": 1}
    assert cache.cached("k", lambda: calls.append(1) or {"v": 2}) == {"v": 1}
    assert calls == [1]


def test_failed_fill_after_clear_does_not_stick_an_empty_result():
    _reset()
    in_fill, release = threading.Event(), threading.Event()

    def failing():
        in_fill.set()
        release.wait(5)
        raise RuntimeError("down")

    t = threading.Thread(target=lambda: cache.cached("training", failing))
    t.start()
    assert in_fill.wait(5)
    cache.clear_cache()
    release.set()
    t.join(5)
    assert "training" not in cache._cache


def test_put_with_a_stale_generation_is_refused():
    _reset()
    gen = cache.generation()
    cache.clear_cache()
    assert cache.put("pc", {"x": 1}, generation=gen) is False
    assert cache.get("pc", 60) == (False, None)
    assert cache.put("pc", {"x": 1}, generation=cache.generation()) is True
    assert cache.get("pc", 60) == (True, {"x": 1})


def test_get_serves_a_copy_and_respects_ttl(monkeypatch):
    _reset()
    cache.put("k", {"a": 1})
    hit, v = cache.get("k", 60)
    v["a"] = 99
    assert cache.get("k", 60)[1] == {"a": 1}
    cache._cache_ts["k"] -= 120
    assert cache.get("k", 60) == (False, None)


def test_drop_prefix_keeps_the_named_entry():
    _reset()
    for k in ("pc_1_a", "pc_1_b", "other"):
        cache.put(k, {})
    cache.drop_prefix("pc_1_", keep="pc_1_b")
    assert sorted(cache._cache) == ["other", "pc_1_b"]
