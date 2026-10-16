"""The weekly slot boundary preserves availability, caps and RNG consumption."""
import copy
from datetime import date, timedelta
from random import Random
from types import SimpleNamespace

import pytest

from week_plan import sampler_slots


def context(**overrides):
    goal = SimpleNamespace(available_days=list(range(7)), rest_days=[],
                           daily_max_hours={}, max_weekday_hours=1.5,
                           max_weekend_hours=4)
    values = dict(goal=goal, start=date(2026, 9, 14), is_stepback=False)
    values.update(overrides)
    return SimpleNamespace(**values)


def test_preferred_hard_days_keep_the_original_rng_draw():
    ctx = context()
    rng, expected = Random(17), Random(17)
    expected.randint(3, 3)
    slots, hard = sampler_slots(ctx, SimpleNamespace(hit_count_min=3, hit_count_max=3), rng)
    assert hard == {1, 3, 5}  # Tue, Thu, Sat for a Monday start
    assert [s[1] for s in slots] == [ctx.start + timedelta(days=i) for i in range(7)]
    assert rng.getstate() == expected.getstate()


def test_stepback_does_not_consume_rng_or_mutate_inputs():
    ctx = context(is_stepback=True)
    before = copy.deepcopy(ctx)
    rng = Random(17)
    initial = rng.getstate()
    slots, hard = sampler_slots(ctx, SimpleNamespace(hit_count_min=3, hit_count_max=3), rng)
    assert len(slots) == 7 and not hard
    assert rng.getstate() == initial
    assert ctx == before


def test_daily_caps_override_defaults_and_explicit_rest_wins():
    ctx = context()
    ctx.goal.daily_max_hours = {1: 0.75, 3: 0, 6: 3.25}
    ctx.goal.rest_days = [1]
    slots, hard = sampler_slots(ctx, SimpleNamespace(hit_count_min=3, hit_count_max=3), Random(17))
    assert [s[4] for s in slots] == [90, 45, 90, 0, 90, 240, 195]
    assert slots[1][5] and 1 not in hard
    # A zero-minute cap is not reinterpreted as a rest flag in this refactor.
    assert not slots[3][5]


@pytest.mark.parametrize("weekday", range(7))
def test_all_availability_masks_keep_hard_slots_available_and_spaced(weekday):
    for mask in range(128):
        ctx = context(start=date(2026, 9, 14) + timedelta(days=weekday))
        ctx.goal.available_days = [d for d in range(7) if mask & (1 << d)]
        slots, hard = sampler_slots(ctx, SimpleNamespace(hit_count_min=4, hit_count_max=5), Random(17))
        assert all(not slots[i][5] for i in hard), (weekday, mask, hard)
        ordered = sorted(hard)
        assert all(b - a >= 2 for a, b in zip(ordered, ordered[1:])), (weekday, mask, hard)
        assert all(s[5] == (s[3] not in ctx.goal.available_days) for s in slots)
