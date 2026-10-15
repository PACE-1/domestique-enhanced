# Tests

Run from the repository root with Python 3.12 and the test dependencies installed:

```sh
python -m pip install -r requirements-dev.txt -c requirements-linux-py312.lock
python -m pytest tests/test_hermetic_home.py tests/test_gate_script.py -q
```

This installs the headless development profile. See [Linux setup](../docs/DEVELOPMENT.md)
for dependency profiles, the Python 3.12 lock and desktop installation. Full
Linux baseline/remote CI validation is tracked in Forgejo issue #2.

`conftest.py` adds `src/` to the import path and sets up the application fixtures.
Before project imports it redirects `HOME` into a fresh per-process directory,
clears inherited `DOMESTIQUE_HOME`, blanks inherited ICU credentials, and disables the
real training transport. Child pytest processes and xdist workers create their
own roots; normal test subprocesses inherit the parent's disposable root.
Sandboxes are removed at interpreter exit. Tests intentionally exercising path
overrides must use temporary directories. Never supply real rider data.

Virtual environments keep their own dependencies: the harness only preserves
the user site when Python actually enables user-site packages. Network mocks
can exercise API behavior without using real accounts. Some historical tests
explicitly read the original home through `DOMESTIQUE_REAL_HOME`; this is not
permission to write there, and their external fixture dependencies remain a
separate isolation task (#8).

## Full verification

```sh
GATE_PYTHON="$PWD/.venv/bin/python" bash tools/gate.sh "$PWD" linux-baseline
```

The gate runs non-hardware bulk tests in parallel by file, then `release_serial`
performance checks without parallel workers. It requires pytest-xdist and
pytest-timeout in the selected interpreter; it never installs dependencies.
`GATE_WORKERS` defaults to 5. `GATE_OUT` selects the log directory (default
`/tmp/domestique-gate`); `GATE_TEST_TIMEOUT` defaults to 900 seconds per test.
The outer bulk and serial limits default to 3300 seconds each.

The exit status remains nonzero for failures, collection/setup errors and outer
timeouts. The historical failure list and isolated reruns are diagnostics, not
permission to return success. Failures that pass alone remain failures of the
original run. Status, full output, failure IDs and rerun logs are saved together.
An optional third argument compares diagnostic failures to a previous label.
`GATE_RERUN_FAILURES=0` skips reruns without changing the result.

For a focused iteration, run `python -m pytest tests/test_<feature>.py -q`.
`pytest.ini` excludes hardware-marked tests by default. Keep expected failures,
skips and platform-specific failures explicit; use a measured baseline rather
than the old documentation's obsolete target of 783 passes.

Unit and endpoint integration tests still share the application-wide harness.
Separating them is tracked in #8. Source-string UI contracts should be replaced
with behavior coverage as workflows migrate (#9), not deleted indiscriminately.
