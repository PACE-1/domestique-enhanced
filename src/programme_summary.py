"""Programme recap calculations over supplied snapshots; no profile or database reads."""
from datetime import date, timedelta


def _ride_started_iso_date(ride: dict) -> str | None:
    """Best-effort 'YYYY-MM-DD' from a list_rides() entry."""
    s = ride.get("started_at") or ""
    if isinstance(s, str) and len(s) >= 10:
        return s[:10]
    return None


def empty_summary() -> dict:
    return {
        "plan_id": "current",
        "start_date": None, "end_date": None, "weeks": 0,
        # The modal keys its empty state off "rides": zero rides must read
        # as "nothing ridden yet", never as measured zeros.
        "rides": 0,
        "ftp_delta": {}, "eftp_delta": {}, "vo2max_delta": {},
        "ctl_gain": {}, "intensity_dist": {}, "pol_index": {},
        "monotony_max": None, "strain_max": None, "compliance": [],
        "mean_max_curve": {"start": [], "end": []}, "hooper_trend": [],
        "totals": {}, "decoupling_trend": [],
        "citations": ["Stöggl 2014", "Foster 1998", "Treff 2019",
                      "Hooper 1995", "Coggan/Allen TR&P"],
    }


def summary_window(plan: dict, today: date) -> tuple[str | None, str | None]:
    weeks = plan.get("weeks") or []
    start_date = weeks[0].get("start") or weeks[0].get("day")
    end_date = weeks[-1].get("end") or weeks[-1].get("day")

    goal_type = str(((plan.get("goal") or {}).get("goal_type")) or "").lower()
    is_continuous = goal_type == "continuous" or any(
        (w.get("phase") or "") == "continuous" for w in weeks[:1])
    if is_continuous and start_date:
        trailing = (today - timedelta(days=28)).isoformat()
        if trailing < start_date:
            start_date = trailing
        if end_date:
            end_date = min(end_date, today.isoformat())
    return (start_date, end_date)


def metric_value_at(history: list[dict], target_date: str, *, after: bool = False) -> float | None:
    """Select the historical boundary value, including the legacy edge fallbacks."""
    if after:
        for row in history:
            if row["date"] >= target_date:
                return float(row["value"])
        return float(history[-1]["value"]) if history else None
    best = None
    for row in history:
        if row["date"] <= target_date:
            best = row["value"]
        else:
            break
    if best is None and history:
        return float(history[0]["value"])
    return float(best) if best is not None else None


def _delta(a, b, *, decimal: bool = False) -> dict:
    if a is None or b is None:
        if decimal:
            return {"start": a, "end": b, "pct": None}
        return {"start": int(round(a)) if a else None,
                "end": int(round(b)) if b else None, "pct": None}
    try:
        pct = round(((b - a) / a) * 100.0, 1) if a else None
    except (TypeError, ZeroDivisionError):
        pct = None
    return {"start": round(a, 1) if decimal else int(round(a)),
            "end": round(b, 1) if decimal else int(round(b)), "pct": pct}


def rides_in_window(all_rides: list[dict], start_date, end_date) -> list[dict]:
    """Normalize FIT/ICU shapes on copies; the ICU sweet-spot overlay is not additive."""
    normalized = [dict(ride) for ride in all_rides]
    for _r in normalized:
        if not _r.get("summary"):
            _r["summary"] = {
                "tss": _r.get("tss"),
                "distance_km": _r.get("distance_km"),
                "duration_sec": _r.get("duration_s") or _r.get("moving_s"),
                "kj_mechanical": _r.get("kj"),
                "elevation_gain_m": _r.get("elevation_m"),
                "decoupling_pct": _r.get("decoupling_pct"),
            }
        if not _r.get("zones") and isinstance(_r.get("time_in_zone"), dict):
            _r["zones"] = {k: v for k, v in _r["time_in_zone"].items()
                           if k != "ss"}
    in_window = []
    for r in normalized:
        d = _ride_started_iso_date(r)
        if d and start_date and end_date and start_date <= d <= end_date:
            in_window.append(r)
    return in_window


def _best_20min_window(rides_subset: list[dict]) -> int | None:
    best = 0
    for r in rides_subset:
        summary = r.get("summary") or {}
        for k in ("peak_20min", "best_20min", "p20min"):
            v = summary.get(k)
            if v and v > best:
                best = float(v)
        for eff in (r.get("efforts") or []):
            lab = (eff.get("label") or eff.get("name") or "")
            secs = eff.get("secs") or eff.get("seconds") or 0
            w = eff.get("watts") or eff.get("power") or 0
            if "20" in str(lab) and ("min" in str(lab).lower() or secs == 1200) and w > best:
                best = float(w)
    return int(round(best)) if best > 0 else None


def _intensity(in_window):
    z1z2_secs = 0
    z3_secs = 0
    z4plus_secs = 0
    for r in in_window:
        tiz = r.get("zones") or {}
        if isinstance(tiz, dict):
            try:
                z1z2_secs += int(tiz.get("z1") or 0) + int(tiz.get("z2") or 0)
                z3_secs += int(tiz.get("z3") or 0)
                z4plus_secs += (int(tiz.get("z4") or 0) + int(tiz.get("z5") or 0)
                                + int(tiz.get("z6") or 0) + int(tiz.get("z7") or 0))
            except (TypeError, ValueError):
                pass
    intensity_dist = {
        "z1z2_min": int(round(z1z2_secs / 60.0)),
        "z3_min": int(round(z3_secs / 60.0)),
        "z4plus_min": int(round(z4plus_secs / 60.0)),
    }

    from analytics import compute_polarization_block, classify_distribution
    pol_indices = []
    for r in in_window:
        block = compute_polarization_block(r.get("zones") or {})
        if block and block.get("polarization_index") is not None:
            pol_indices.append(block["polarization_index"])
    if pol_indices:
        pol_mean = round(sum(pol_indices) / len(pol_indices), 2)
        total_s = z1z2_secs + z3_secs + z4plus_secs
        if total_s > 0:
            z1z2_pct = 100.0 * z1z2_secs / total_s
            z3_pct = 100.0 * z3_secs / total_s
            z4_pct = 100.0 * z4plus_secs / total_s
            klass = classify_distribution(z1z2_pct, z3_pct, z4_pct, pol_mean)
        else:
            klass = "—"
        pol_block = {"mean": pol_mean, "class": klass}
    else:
        pol_block = {"mean": None, "class": "—"}
    return (intensity_dist, pol_block)


def _monotony(in_window, start_date, end_date):
    """Preserve seven-day bins anchored to the recap start, including rest days."""
    import statistics as _stat
    monotony_max = None
    strain_max = None
    if start_date and end_date:
        try:
            import datetime as _dt
            week_start = _dt.date.fromisoformat(start_date)
            week_end_d = _dt.date.fromisoformat(end_date)
            cursor = week_start
            while cursor <= week_end_d:
                daily = {}
                for k in range(7):
                    daily[(cursor + _dt.timedelta(days=k)).isoformat()] = 0.0
                for r in in_window:
                    d = _ride_started_iso_date(r)
                    if d and d in daily:
                        tss = (r.get("summary") or {}).get("tss") or 0
                        daily[d] += float(tss)
                loads = list(daily.values())
                weekly_load = sum(loads)
                if weekly_load > 0:
                    try:
                        sd = _stat.stdev(loads)
                    except _stat.StatisticsError:
                        sd = 0
                    if sd > 0:
                        m = _stat.mean(loads) / sd
                        s = weekly_load * m
                        if monotony_max is None or m > monotony_max:
                            monotony_max = round(m, 2)
                        if strain_max is None or s > strain_max:
                            strain_max = round(s, 1)
                cursor += _dt.timedelta(days=7)
        except Exception:
            pass
    return (monotony_max, strain_max)


def _compliance(plan, in_window):
    weeks = plan.get("weeks") or []
    compliance = []
    phases = plan.get("phases") or []
    for ph in phases:
        ph_start = ph.get("start")
        ph_end = ph.get("end")
        if not ph_start or not ph_end:
            continue
        weekly_tss = float(ph.get("weekly_tss") or 0)
        phase_weeks = int(ph.get("weeks") or 0) or max(
            1, sum(1 for w in weeks if w.get("phase") == ph.get("name")))
        planned = weekly_tss * phase_weeks
        actual = 0.0
        for r in in_window:
            d = _ride_started_iso_date(r)
            if d and ph_start <= d <= ph_end:
                actual += float((r.get("summary") or {}).get("tss") or 0)
        pct = int(round(100.0 * actual / planned)) if planned > 0 else 0
        compliance.append({
            "phase": ph.get("name"),
            "planned_tss": round(planned, 1),
            "actual_tss": round(actual, 1),
            "pct": pct,
        })
    return compliance


def _mean_max_curve(in_window, start_date, end_date):
    sd_d, ed_d = window_dates(start_date, end_date)
    early_4w = []
    last_4w = []
    if sd_d and ed_d:
        early_cut = (sd_d + timedelta(days=28)).isoformat()
        last_cut = (ed_d - timedelta(days=28)).isoformat()
        for r in in_window:
            d = _ride_started_iso_date(r)
            if not d:
                continue
            if d <= early_cut:
                early_4w.append(r)
            if d >= last_cut:
                last_4w.append(r)

    def _peaks(rides_subset: list[dict]) -> list[dict]:
        out = []
        for tgt_sec in (5, 60, 300, 1200, 3600):
            best = 0
            for r in rides_subset:
                summary = r.get("summary") or {}
                for k in (f"peak_{tgt_sec}s", f"best_{tgt_sec}s",
                          f"peak_{tgt_sec // 60}m", f"best_{tgt_sec // 60}m"):
                    v = summary.get(k)
                    if v and float(v) > best:
                        best = float(v)
                for eff in (r.get("efforts") or []):
                    secs = eff.get("secs") or eff.get("seconds") or 0
                    w = eff.get("watts") or eff.get("power") or 0
                    if abs(secs - tgt_sec) <= max(2, tgt_sec * 0.05) and w > best:
                        best = float(w)
            out.append({"dur": tgt_sec, "watts": int(round(best)) if best > 0 else None})
        return out

    mm = {"start": _peaks(early_4w), "end": _peaks(last_4w)}
    return mm


def _hooper_trend(log_rows, start_date, end_date):
    sd_d, ed_d = window_dates(start_date, end_date)
    hooper_trend: list[dict] = []
    try:
        if sd_d and ed_d:
            by_date = {row["date"]: row.get("hooper_index") for row in log_rows}
            week_idx = 0
            cur = sd_d
            while cur <= ed_d:
                vals = []
                for k in range(7):
                    di = (cur + timedelta(days=k)).isoformat()
                    v = by_date.get(di)
                    if v is not None:
                        try:
                            vals.append(float(v))
                        except (TypeError, ValueError):
                            pass
                if vals:
                    hooper_trend.append({
                        "week": week_idx + 1,
                        "mean": round(sum(vals) / len(vals), 1),
                    })
                week_idx += 1
                cur += timedelta(days=7)
    except Exception:
        hooper_trend = []
    return hooper_trend


def _totals(in_window):
    total_km = 0.0
    total_sec = 0
    total_kj = 0.0
    total_elev = 0.0
    for r in in_window:
        s = r.get("summary") or {}
        total_km += float(s.get("distance_km") or 0)
        total_sec += int(s.get("duration_sec") or 0)
        kj = s.get("kj_mechanical") or s.get("calories") or s.get("total_kj") or 0
        try:
            total_kj += float(kj)
        except (TypeError, ValueError):
            pass
        total_elev += float(s.get("elevation_gain_m") or 0)
    totals = {
        "km": int(round(total_km)),
        "hours": round(total_sec / 3600.0, 1),
        "kj": int(round(total_kj)),
        "elev_m": int(round(total_elev)),
    }
    return totals


def _decoupling_trend(in_window, start_date, end_date):
    sd_d, ed_d = window_dates(start_date, end_date)
    decoupling_trend: list[dict] = []
    if sd_d and ed_d:
        cur = sd_d
        wk_idx = 0
        while cur <= ed_d:
            vals = []
            for r in in_window:
                d = _ride_started_iso_date(r)
                if not d:
                    continue
                d_iter = date.fromisoformat(d)
                if cur <= d_iter <= cur + timedelta(days=6):
                    dec = (r.get("summary") or {}).get("decoupling_pct")
                    if dec is None:
                        dec = r.get("decoupling_pct")
                    if dec is not None:
                        try:
                            vals.append(float(dec))
                        except (TypeError, ValueError):
                            pass
            if vals:
                decoupling_trend.append({
                    "week": wk_idx + 1,
                    "mean_pct": round(sum(vals) / len(vals), 1),
                })
            wk_idx += 1
            cur += timedelta(days=7)
    return decoupling_trend


def window_dates(start_date, end_date) -> tuple[date | None, date | None]:
    try:
        return (date.fromisoformat(start_date) if start_date else None,
                date.fromisoformat(end_date) if end_date else None)
    except (ValueError, TypeError):
        return None, None


def build_summary(plan, in_window, *, start_date, end_date, metric_values,
                  ctl_start_val, ctl_end_val, log_rows) -> dict:
    """Compose the recap from already-read data; inputs are not modified."""
    ftp_start, ftp_end = metric_values["ftp"]
    vo2_start, vo2_end = metric_values["vo2max"]
    half = max(1, len(in_window) // 2)
    ordered_rides = sorted(in_window, key=lambda r: r.get("started_at") or "")
    early_rides, late_rides = ordered_rides[:half], ordered_rides[half:]

    eftp_start_w = None
    eftp_end_w = None
    p20_start = _best_20min_window(early_rides)
    p20_end = _best_20min_window(late_rides)
    if p20_start:
        eftp_start_w = int(round(p20_start * 0.95))
    if p20_end:
        eftp_end_w = int(round(p20_end * 0.95))
    if eftp_start_w is None:
        eftp_start_w = int(round(ftp_start)) if ftp_start else None
    if eftp_end_w is None:
        eftp_end_w = int(round(ftp_end)) if ftp_end else None

    ctl_block = {
        "start": ctl_start_val,
        "end": ctl_end_val,
        "delta": (round(ctl_end_val - ctl_start_val, 1)
                  if (ctl_start_val is not None and ctl_end_val is not None)
                  else None),
    }

    intensity_dist, pol_block = _intensity(in_window)
    monotony_max, strain_max = _monotony(in_window, start_date, end_date)
    compliance = _compliance(plan, in_window)
    mm = _mean_max_curve(in_window, start_date, end_date)
    hooper_trend = _hooper_trend(log_rows, start_date, end_date)
    totals = _totals(in_window)
    decoupling_trend = _decoupling_trend(in_window, start_date, end_date)
    return {
        "plan_id": "current",
        "start_date": start_date,
        "end_date": end_date,
        "weeks": len(plan.get("weeks") or []),
        "rides": len(in_window),
        "ftp_delta": _delta(ftp_start, ftp_end),
        "eftp_delta": _delta(eftp_start_w, eftp_end_w),
        "vo2max_delta": _delta(vo2_start, vo2_end, decimal=True),
        "ctl_gain": ctl_block,
        "intensity_dist": intensity_dist,
        "pol_index": pol_block,
        "monotony_max": monotony_max,
        "strain_max": strain_max,
        "compliance": compliance,
        "mean_max_curve": mm,
        "hooper_trend": hooper_trend,
        "totals": totals,
        "decoupling_trend": decoupling_trend,
        "citations": [
            "Stöggl & Sperlich 2014 (Front Physiol)",
            "Foster 1998 (MSSE)",
            "Treff et al. 2019 (Front Physiol)",
            "Hooper & Mackinnon 1995",
            "Coggan & Allen TR&P 3rd ed.",
            "Seiler 2010 (IJSPP)",
        ],
    }
