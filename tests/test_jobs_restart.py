"""#17 - the stop flag does not outlive the run that set it."""
import threading

import jobs


def test_a_clean_shutdown_leaves_no_stop_flag_behind():
    """Every test client that enters a lifespan context shuts jobs down; the next
    test in the same process must not find backfills and syncs "stopping"."""
    import app as app_module
    from fastapi.testclient import TestClient
    with TestClient(app_module.app):
        pass
    assert jobs.stopping() is False


def test_a_straggler_keeps_the_flag_until_a_new_run_begins():
    release = threading.Event()
    jobs.reset_for_tests()
    jobs.start_thread(lambda: release.wait(30), name="stubborn")
    rep = jobs.shutdown(budget_s=0.2)
    assert rep["still_running"] == ["stubborn"] and jobs.stopping() is True
    release.set()
    jobs.begin()
    assert jobs.stopping() is False
    jobs.reset_for_tests()
