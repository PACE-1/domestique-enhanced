"""#17 — the stop flag does not outlive the run that set it."""
import jobs


def test_a_new_app_run_clears_the_stop_flag_a_previous_shutdown_set():
    """Starting the app twice in one process (test clients do) must not leave the
    second run's backfills stopping at once."""
    import app as app_module
    from fastapi.testclient import TestClient
    with TestClient(app_module.app):
        pass                                    # lifespan shutdown sets the flag
    assert jobs.stopping() is True
    with TestClient(app_module.app):
        assert jobs.stopping() is False         # startup cleared it
