"""The rolling intensity window compares instants across input/host timezones."""
from datetime import datetime, timedelta, timezone
import time

import pytest

import training_planner as tp

NOW = datetime(2026, 10, 15, 12, tzinfo=timezone.utc)


@pytest.fixture(params=['UTC', 'Pacific/Honolulu', 'Europe/Berlin'])
def host_timezone(request, monkeypatch):
    with monkeypatch.context() as mp:
        mp.setenv('TZ', request.param)
        time.tzset()
        try:
            yield request.param
        finally:
            mp.undo()
            time.tzset()


def _ride(stamp):
    return {'start_date_local': stamp, 'time_in_zone': {'z5': 600, 'z6': 120, 'z7': 180}}


@pytest.mark.parametrize('offset', [-10, 0, 2])
@pytest.mark.parametrize('seconds_ago,expected', [
    (48 * 3600 + 1, 0), (48 * 3600, 15), (48 * 3600 - 1, 15),
    (1, 15), (0, 15), (-1, 0),
])
def test_window_boundaries_are_instants(host_timezone, freeze_clock, offset, seconds_ago, expected):
    freeze_clock(NOW)
    stamp = (NOW - timedelta(seconds=seconds_ago)).astimezone(
        timezone(timedelta(hours=offset))).isoformat()
    if offset == 0:
        stamp = stamp.replace('+00:00', 'Z')
    assert tp._last_48h_z5plus_min([_ride(stamp)]) == expected


def test_naive_timestamp_means_host_local_time(host_timezone, freeze_clock):
    freeze_clock(NOW)
    expected = 0 if host_timezone == 'Europe/Berlin' else 15
    assert tp._last_48h_z5plus_min([_ride('2026-10-13T12:00:00')]) == expected


def test_date_only_means_local_midnight(host_timezone, freeze_clock):
    freeze_clock(NOW)
    assert tp._last_48h_z5plus_min([_ride('2026-10-14')]) == 15
    assert tp._last_48h_z5plus_min([_ride('2026-10-13')]) == 0


@pytest.mark.parametrize('stamp', ['', None, 123, 'not-a-date'])
def test_invalid_dates_do_not_break_the_gate(freeze_clock, stamp):
    freeze_clock(NOW)
    assert tp._last_48h_z5plus_min([_ride(stamp)]) == 0
