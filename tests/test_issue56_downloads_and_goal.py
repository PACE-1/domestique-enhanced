"""Issues #5 (empty ZWO/FIT downloads) + #6 (goal reverts to Event).

#5 — On macOS the pywebview bridge fetch() can resolve with an EMPTY body
(WKWebView download interception), so the native save wrote 0-byte files. The
launcher runs the FastAPI app in-process, so JsApi now produces the bytes
SERVER-SIDE when the JS body is empty, and refuses to write 0 bytes. Plus the
FIT builder fails loudly (422) on a ZWO that yields no steps instead of emitting
a useless header-only file.

#6 — populatePlanFormFromGoal restored ~12 fields but never the goal selector,
so it snapped back to the hardcoded <option value="event"> after restart.
"""
import glob
import os
import re
import unittest
from pathlib import Path

import app
import launcher

REPO = Path(__file__).resolve().parent.parent


def _a_library_zwo() -> str:
    return os.path.basename(sorted(glob.glob(str(REPO / "src" / "workouts" / "*.zwo")))[0])


class TestFitBytesGuards(unittest.TestCase):
    def test_generic_fit_has_bytes(self):
        self.assertGreater(len(app.build_fit_workout_bytes("vo2max", 60, "t")), 100)

    def test_from_zwo_has_bytes(self):
        self.assertGreater(
            len(app.build_fit_workout_bytes("z2", 60, "t", _a_library_zwo())), 100)

    def test_missing_zwo_raises(self):
        with self.assertRaises(FileNotFoundError):
            app.build_fit_workout_bytes("z2", 60, "t", "does_not_exist_xyz.zwo")

    def test_zero_step_zwo_raises_not_empty_file(self):
        tmp = Path(app.WORKOUT_DIR) / "_t_issue5_empty.zwo"
        tmp.write_text("<workout_file><workout></workout></workout_file>")
        try:
            with self.assertRaises(ValueError):
                app.build_fit_workout_bytes("z2", 60, "t", tmp.name)
        finally:
            tmp.unlink(missing_ok=True)


class TestJsApiServerSideFallback(unittest.TestCase):
    """The core #5 fix: empty JS body → real bytes produced in-process."""

    def setUp(self):
        self.api = launcher.JsApi()

    def test_zwo_read_serverside_when_js_empty(self):
        data = self.api._read_zwo_serverside(_a_library_zwo())
        self.assertGreater(len(data), 10)

    def test_fit_build_serverside_when_js_empty(self):
        data = self.api._build_fit_serverside("vo2max", 60, "t", None)
        self.assertGreater(len(data), 100)

    def test_save_refuses_empty_payload(self):
        # Must NOT pop a dialog / write a 0-byte file.
        res = self.api._save("x.zwo", b"", ())
        self.assertFalse(res["ok"])

    def test_save_fit_malformed_b64_without_params_still_errors(self):
        res = self.api.save_fit("w.fit", "###not-b64###")
        self.assertFalse(res["ok"])
        self.assertIn("base64", res["error"].lower())


if __name__ == "__main__":
    unittest.main()
