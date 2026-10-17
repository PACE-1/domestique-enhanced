"""A check-in saved without notes must not erase notes saved earlier the same day."""
import db


def test_saving_ratings_again_keeps_the_stored_notes_and_new_notes_replace_them():
    day = "2026-01-05"
    db.upsert_daily_log(day, 3, 3, 3, 3, 3, notes="left knee tight")
    again = db.upsert_daily_log(day, 2, 3, 3, 3, 3)
    assert again["notes"] == "left knee tight" and again["sleep_quality"] == 2
    assert db.get_db().execute("SELECT notes FROM daily_log WHERE date = ?", (day,)).fetchone()[0] == "left knee tight"
    assert db.upsert_daily_log(day, 2, 3, 3, 3, 3, notes="knee fine")["notes"] == "knee fine"
