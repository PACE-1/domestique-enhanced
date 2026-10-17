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

from pydantic import BaseModel, ConfigDict, Field


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


# ── plan and Home reads (#10) ───────────────────────────────────────────────
# The plan models mirror the planner's own codec (``session_to_dict`` /
# ``week_to_dict`` / ``goal_to_dict``); ``tests/test_api_models_plan.py`` fails if
# a dataclass field is added without being declared here.
class PlanSession(_Model):
    day: str
    day_name: str = ""
    session_type: str
    duration_min: int = 0
    tss_estimate: float = 0
    description: str = ""
    zwo_file: str = ""
    zwo_name: str = ""
    nutrition_note: str = ""
    matched: bool = True
    adapted: bool = False
    status: str = "pending"
    user_moved: bool = False
    moved_from: str = ""
    user_swapped: bool = False
    completion_matches: Optional[list] = None
    dismissed_at: str = ""
    wprime_estimate: Optional[float] = None
    pmax_estimate: Optional[float] = None
    hr_ceiling_pct: Optional[float] = None
    is_double_threshold_pair: bool = False
    double_threshold_partner_id: Optional[str] = None
    am_or_pm: Optional[str] = None
    is_race: bool = False
    race: Optional[dict] = None
    is_opener: bool = False
    execution: Optional[dict] = None


class PlanWeek(_Model):
    week_num: int
    start: str
    end: str
    phase: str = ""
    tss_target: float = 0
    is_stepback: bool = False
    sessions: list[PlanSession] = []


class PlanPhase(_Model):
    name: str
    weeks: int = 0
    start: str = ""
    end: str = ""
    weekly_tss: Optional[float] = None
    focus: str = ""


class PlanGoal(_Model):
    type: str = ""
    event_date: Optional[str] = None
    event_name: str = ""
    hours_per_week: Optional[float] = None
    plan_weeks: Optional[int] = None
    start_date: Optional[str] = None
    entry_mode: Optional[str] = None
    focus: str = ""


class PlanJson(_Model):
    goal: PlanGoal = PlanGoal()
    phases: list[PlanPhase] = []
    weeks: list[PlanWeek] = []
    generated: Optional[str] = None
    ctl_snapshot: Optional[dict] = None
    availability: Optional[dict] = None


class PlanRead(_Model):
    plan_json: PlanJson
    plan: str = ""
    file: str = ""


class ProgrammeSummary(_Model):
    plan_id: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    weeks: int = 0
    rides: int = 0
    ftp_delta: Optional[dict] = None
    eftp_delta: Optional[dict] = None
    vo2max_delta: Optional[dict] = None
    ctl_gain: Optional[dict] = None
    intensity_dist: Optional[dict] = None
    pol_index: Optional[dict] = None
    compliance: list[dict] = []
    totals: Optional[dict] = None
    citations: list[str] = []


class RiderStats(_Model):
    errors: list[str] = []
    power: Optional[dict] = None
    peaks: Optional[dict] = None
    heart: Optional[dict] = None
    efficiency: Optional[dict] = None
    load: Optional[dict] = None
    body: Optional[dict] = None
    season: Optional[dict] = None


class SessionDismissed(_Model):
    ok: bool = True
    dismissed: bool


class SessionMoved(_Model):
    ok: bool = True
    moved: Optional[PlanSession] = None
    vacated: Optional[str] = None      # date the move left empty, if any
    swapped: Optional[PlanSession] = None   # the session now on the source date, on a swap


class SessionSwapped(_Model):
    ok: bool = True
    day: str
    session_type: str
    duration_min: int = 0
    tss_estimate: float = 0
    zwo_file: str = ""
    zwo_name: str = ""
    sessions_modified: Optional[int] = None   # later sessions the reforecast rebalanced


class UnavailablePeriod(_Model):
    start: str
    end: str
    type: str = "holiday"
    daily_tss: float = 0
    reason: str = ""


class UnavailableMarked(_Model):
    ok: bool = True
    period: UnavailablePeriod
    plan_json: Optional[PlanJson] = None


class PlanRegenerated(_Model):
    ok: bool = True
    plan_json: Optional[PlanJson] = None
    regen_info: Optional[dict] = None


# ── Plan tools: availability, races, FTP-test type, rematch, redraw, deload ──

class AvailabilitySaved(_Model):
    ok: bool = True
    sessions_modified: int = 0


class RaceAdded(_Model):
    ok: bool = True
    plan_json: Optional[PlanJson] = None
    regen_info: Optional[dict] = None
    added: Optional[dict] = None


class FtpTestTypeSet(_Model):
    ok: bool = True
    test_type: str
    zwo_file: str = ""
    zwo_name: str = ""
    duration_min: Optional[int] = None
    tss_estimate: Optional[float] = None
    display_name: Optional[str] = None


class RematchResult(_Model):
    """Preview (apply=0) or result (apply=1). `action` is set when there is no current week."""
    ok: Optional[bool] = None
    apply: Optional[bool] = None
    action: Optional[str] = None
    changed: Optional[int] = None


class RedrawCandidate(_Model):
    ok: bool = True
    action: Optional[str] = None       # "no_candidate" / "invalid" when ok is false
    day: str = ""
    reason: Optional[str] = None
    session_type: Optional[str] = None
    zwo_file: Optional[str] = None
    zwo_name: Optional[str] = None
    variation: Optional[int] = None
    duration_min: Optional[int] = None
    tss_estimate: Optional[float] = None
    exhausted: Optional[bool] = None


class RedrawAccepted(_Model):
    ok: bool = True
    day: str = ""
    sessions_modified: int = 0


class DeloadReverted(_Model):
    reverted: bool
    reason: Optional[str] = None
    week_num: Optional[int] = None


# ── Today: readiness, adapted session, daily log ────────────────────────────

class ReadinessAdvice(_Model):
    advice: str = ""


class Readiness(_Model):
    score_0_100: Optional[float] = None
    severity: str = "normal"           # normal | tier_down | rest
    source: Optional[str] = None
    severity_reasons: list[str] = []
    readiness: Optional[ReadinessAdvice] = None
    dfa_cap_applied: Optional[bool] = None
    decoupling_advisory: Optional[bool] = None


class TodaySessionPlan(_Model):
    session_type: str
    duration_min: int = 0
    tss_estimate: float = 0
    description: str = ""
    zwo_name: Optional[str] = None


class TodaySession(_Model):
    planned: Optional[TodaySessionPlan] = None
    adjusted: Optional[TodaySessionPlan] = None
    reason: str = ""
    adjustment_reason: Optional[str] = None
    was_modified: bool = False
    has_plan: Optional[bool] = None
    is_race: bool = False


class TodayPersisted(_Model):
    ok: bool = True
    day: str
    adapted_reason: str = ""
    session_type: str


class CapReverted(_Model):
    ok: bool = True
    reverted: bool = True
    restored: Optional[dict] = None


class TierDownApplied(_Model):
    ok: bool = True
    action: Optional[str] = None       # why nothing changed, when ok is false
    day: str = ""
    old_type: Optional[str] = None
    new_type: Optional[str] = None
    old_tss: Optional[float] = None
    new_tss: Optional[float] = None
    duration_min: Optional[int] = None
    zwo_name: Optional[str] = None


class AutoAdjustResult(_Model):
    ok: bool = True
    severity: str = "normal"
    scope: str = "today"
    dry_run: bool = False
    actions: list[dict] = []
    applied: Optional[bool] = None
    sessions_modified: int = 0
    note: str = ""


class DailyLogEntry(_Model):
    date: str
    sleep_quality: Optional[int] = None
    fatigue: Optional[int] = None
    soreness: Optional[int] = None
    stress: Optional[int] = None
    mood: Optional[int] = None
    notes: Optional[str] = None
    hooper_index: Optional[int] = None
    readiness_to_train: Optional[int] = None


class DailyLogRead(_Model):
    today: Optional[DailyLogEntry] = None
    history: list[DailyLogEntry] = []


class DailyLogSaved(_Model):
    ok: bool = True
    entry: DailyLogEntry


# ── Workout library and picker ──────────────────────────────────────────────

class WorkoutRow(_Model):
    model_config = ConfigDict(extra="allow", populate_by_name=True)
    name: str = Field("", alias="Name")
    category: str = Field("", alias="Category")
    file: str = Field("", alias="File")
    duration_min: float = Field(0, alias="Duration(min)")
    tss: float = Field(0, alias="TSS")
    intensity_factor: float = Field(0, alias="IF")
    score: Optional[float] = Field(None, alias="Score")
    protocol: Optional[str] = Field(None, alias="Protocol")
    tags: list[str] = Field(default_factory=list, alias="Tags")
    content_class: Optional[str] = None
    display_name: Optional[str] = None


class WorkoutSegment(_Model):
    type: str
    start: float = 0
    duration: float = 0
    power: Optional[float] = None
    pct: Optional[float] = None


class WorkoutDetail(_Model):
    name: str = ""
    display_name: Optional[str] = None
    description: str = ""
    total_seconds: int = 0
    segments: list[WorkoutSegment] = []
    ftp: Optional[float] = None
    hr_available: bool = False


class PickerResult(_Model):
    type: str = "z2"
    readiness: Optional[float] = None
    status: str = ""
    advice: str = ""
    baseline_used: Optional[bool] = None
    workouts: list[WorkoutRow] = []


# ── Routes and climbs ───────────────────────────────────────────────────────

class RouteSummary(_Model):
    id: str
    name: str = ""
    region: str = ""
    crs_region: Optional[str] = None
    file: Optional[str] = None
    source: str = ""                   # virtual | real
    distance_km: float = 0
    climb_m: float = 0
    max_grade: Optional[float] = None
    difficulty_score: Optional[float] = None
    category: Optional[str] = None
    terrain: Optional[str] = None
    primary_surface: Optional[str] = None
    loop: Optional[bool] = None
    est_duration_min_z2: Optional[float] = None
    est_tss: Optional[float] = None
    tags: list[str] = []
    preview_profile: list[list[float]] = []   # [km, elevation m] pairs
    surface_mix_pct: Optional[dict] = None


class RoutesList(_Model):
    total_matching: int = 0
    returned: int = 0
    routes: list[RouteSummary] = []


class RegionWorld(_Model):
    region: str
    source: str = ""
    count: int = 0
    emoji: str = ""
    title: str = ""
    blurb: str = ""


class RealWorldRegion(_Model):
    region: str
    count: int = 0
    title: str = ""


class RealWorldMeta(_Model):
    count: int = 0
    title: str = ""
    regions: list[RealWorldRegion] = []


class RegionsList(_Model):
    worlds: list[RegionWorld] = []
    real_world_meta: Optional[RealWorldMeta] = None

