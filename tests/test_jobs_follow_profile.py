"""#5 - a background job stops when the rider switches profile under it."""
import threading

import jobs


def test_job_sees_stopping_after_a_profile_switch(monkeypatch):
    jobs.reset_for_tests()
    active = {"id": "anna"}
    monkeypatch.setattr(jobs, "_active_profile_id", lambda: active["id"])
    started, switched, seen = threading.Event(), threading.Event(), []

    def work():
        seen.append(jobs.stopping())      # before the switch
        started.set()
        switched.wait(5)
        seen.append(jobs.stopping())      # after the switch

    t = jobs.start_thread(work, name="t-follow")
    assert started.wait(5)
    active["id"] = "bob"
    switched.set()
    t.join(5)
    assert seen == [False, True]
    assert jobs.stopping() is False       # a request thread is not affected


def test_job_keeps_running_while_the_profile_is_unchanged(monkeypatch):
    jobs.reset_for_tests()
    monkeypatch.setattr(jobs, "_active_profile_id", lambda: "anna")
    seen = []
    jobs.start_thread(lambda: seen.append(jobs.stopping()), name="t-same").join(5)
    assert seen == [False]


def test_job_started_before_any_profile_is_not_stopped_by_activation(monkeypatch):
    jobs.reset_for_tests()
    active = {"id": ""}
    monkeypatch.setattr(jobs, "_active_profile_id", lambda: active["id"])
    go, seen = threading.Event(), []
    t = jobs.start_thread(lambda: (go.wait(5), seen.append(jobs.stopping())), name="t-boot")
    active["id"] = "anna"
    go.set()
    t.join(5)
    assert seen == [False]
