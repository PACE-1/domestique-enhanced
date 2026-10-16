"""Typed response contracts for the endpoints the new UI uses (#10).

Scope is the migrated workflows, not the whole API: profile picker, setup
wizards, intervals.icu connection and the DFA tab. The models are attached to
routes with ``responses={200: {"model": ...}}``, which documents the contract
in OpenAPI WITHOUT validating or filtering live responses, so a value of an
unexpected type can never turn a working endpoint into a 500. Every model also
allows extra keys.

``tests/test_api_contract.py`` compares the generated OpenAPI schema of these
routes with ``tests/api_contract.json``, and ``web/src/api/schema.d.ts`` is
generated from the same schema (``tools/gen-api-types.sh``). A change that
alters a contract therefore fails a test until the snapshot is regenerated on
purpose.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict


class _Model(BaseModel):
    model_config = ConfigDict(extra="allow")


class Ok(_Model):
    ok: bool = True


# ── profiles ────────────────────────────────────────────────────────────────
class ProfileEntry(_Model):
    id: str
    name: str = ""
    color: Optional[str] = None
    created: Optional[str] = None
    last_used: Optional[str] = None
    bootstrapped: Optional[bool] = None
    ftp: Optional[float] = None
    weight_kg: Optional[float] = None


class ProfilesList(_Model):
    active: Optional[str] = None
    active_name: Optional[str] = None
    active_color: Optional[str] = None
    profiles: list[ProfileEntry] = []


class ProfileCreated(_Model):
    ok: bool = True
    id: str
    warning: Optional[str] = None


class ProfileSwitched(_Model):
    ok: bool = True
    active: Optional[str] = None


class EnsureProfile(_Model):
    ok: bool = True
    id: str


# ── setup ───────────────────────────────────────────────────────────────────
class SetupDefaults(_Model):
    icu_id: str = ""
    workout_dir: str = ""
    gpx_dir: str = ""
    weight: Optional[float] = None
    ftp: Optional[float] = None
    lthr: Optional[float] = None
    max_hr: Optional[float] = None


class IcuConnection(_Model):
    connected: bool = False
    method: str = "none"          # "oauth" | "apikey" | "none"
    athlete_id: str = ""
    name: str = ""
    write_ok: bool = False
    needs_oauth_migration: bool = False
    oauth_available: bool = False


class SyncProgress(_Model):
    state: Optional[str] = None   # idle | running | done | stale
    total: Optional[int] = None
    done: Optional[int] = None
    added: Optional[int] = None
    updated: Optional[int] = None
    ts: Optional[float] = None


# ── DFA α1 ──────────────────────────────────────────────────────────────────
class DfaThreshold(_Model):
    hr: Optional[float] = None
    power: Optional[float] = None
    r2_hr: Optional[float] = None
    r2_power: Optional[float] = None
    r2_hr_median: Optional[float] = None
    r2_power_median: Optional[float] = None
    n_hr: Optional[int] = None
    n_power: Optional[int] = None
    date_span: Optional[list[str]] = None


class DfaZoneMinutes(_Model):
    z1: float = 0
    z2: float = 0
    z3: float = 0


class DfaRide(_Model):
    id: str
    date: Optional[str] = None
    name: Optional[str] = None
    duration_min: Optional[float] = None
    avg_hr: Optional[float] = None
    alpha1_avg: Optional[float] = None
    lt1_minutes: Optional[float] = None
    status: Optional[str] = None
    zone_minutes: Optional[DfaZoneMinutes] = None
    hrvt1: Optional[DfaThreshold] = None
    hrvt1_note: Optional[str] = None
    hrvt2: Optional[DfaThreshold] = None
    hrvt2_note: Optional[str] = None
    algo_version: Optional[int] = None


class DfaAggregate(_Model):
    hrvt1: Optional[DfaThreshold] = None
    hrvt2: Optional[DfaThreshold] = None
    n_window: Optional[int] = None
    agg_min_r2: Optional[float] = None
    agg_max_decoupling: Optional[float] = None
    n_excluded_decoupling: Optional[int] = None


class DfaRides(_Model):
    rides: list[DfaRide] = []
    aggregate: DfaAggregate = DfaAggregate()
    n_total: int = 0
    n_computed: int = 0
    n_stale_version: int = 0


class BackfillStarted(_Model):
    status: str                   # "started" | "already_running"
    task_id: Optional[str] = None


class BackfillStatus(_Model):
    task_id: Optional[str] = None
    state: Optional[str] = None   # running | done | cancelled | error
    augmented: Optional[int] = None
    candidates: Optional[int] = None
    computed: Optional[int] = None
    no_rr_data: Optional[int] = None
    icu_deleted: Optional[int] = None
    failed: Optional[int] = None
    current: Optional[str] = None
