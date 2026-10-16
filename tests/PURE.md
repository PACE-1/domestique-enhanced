# Pure tests

`tests/conftest.py` imports the whole application and installs the clock shim and
per-test resets, so even a narrow test pays for it. Tests that never touch the
app run without it:

```sh
tools/run_pure_tests.sh                    # about a minute with PURE_WORKERS=16
PURE_PYTHON=.venv/bin/python PURE_WORKERS=8 tools/run_pure_tests.sh -k zones
```

- The run loads only `tests/_sandbox.py` (src on `sys.path`, HOME swapped to a
  temporary directory, inherited data root and credentials cleared, no-network
  flag). It never reaches real rider data.
- `tests/pure_files.txt` lists the files. `_pure_guard.py` fails the run if
  anything imported `app`, `launcher` or `fastapi`; `test_pure_list.py` keeps the
  list honest (files exist, none imports the app or `conftest`, sorted).
- Qualification: a file is listed only if it passes without `tests/conftest.py`
  **and** at five shifted "today" dates (0, 3, 9, 25 and 70 days ahead) and in
  reversed file order. Files that depend on the conftest clock shim (planner and
  plan-week suites) stay out; they run in the full gate.
- The full suite (`tools/gate.sh`) still runs every file, pure ones included,
  under `tests/conftest.py`.

To add a file: put it in `pure_files.txt` (sorted), then run the script. If it
fails only without the conftest, it is not pure.
