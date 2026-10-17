import type { AutoAdjustResult, AvailabilitySaved, CapReverted, DailyLogRead, DailyLogSaved, DeloadReverted, FtpTestTypeSet, RaceAdded, Readiness, RedrawAccepted, RedrawCandidate, RematchResult, TierDownApplied, TodayPersisted, TodaySession, PlanJson, PlanRead, PlanRegenerated, PlanSession, PlanWeek, ProgrammeSummary, RiderStats, SessionDismissed, SessionMoved, SessionSwapped, UnavailableMarked } from "@/api/types"
import { api } from "@/lib/api"

export const getPlan = () => api<PlanRead>("/api/plan")
export const getSummary = () => api<ProgrammeSummary>("/api/programme/summary")
/** Dismiss (or restore) the session on a day. The server applies it to every session on that date. */
export const dismissSession = (date: string, undo = false) =>
  api<SessionDismissed>("/api/plan/dismiss-session", { method: "POST", json: { date, undo } })

/** Move the session on `date` to `newDate`. Onto a day with one session the two swap; a ridden or crowded day is refused. */
export const moveSession = (date: string, newDate: string) =>
  api<SessionMoved>("/api/plan/move-session", { method: "POST", json: { date, new_date: newDate } })

// The types the server accepts for a swap (_SWAP_TYPES in app.py).
export const SWAP_TYPES = [
  ["recovery", "Recovery"],
  ["z2", "Endurance"],
  ["tempo", "Tempo"],
  ["sweetspot", "Sweet spot"],
  ["threshold", "Threshold"],
  ["overunder", "Over-under"],
  ["vo2max", "VO2max"],
  ["sprint", "Sprint"],
  ["ftp_test", "FTP test"],
] as const

/** Change the day's session to another type and length; the server pins it and rebalances the rest. */
export const swapSessionType = (date: string, sessionType: string, durationMin: number) =>
  api<SessionSwapped>("/api/plan/swap-type", {
    method: "POST",
    json: { date, session_type: sessionType, duration_min: durationMin },
  })

export interface GenerateRequest {
  goal: "general" | "ftp" | "event"
  hours_per_week: number
  plan_weeks: number
  rest_days: number[] // 0 = Monday
  start_date?: string
  event_name?: string
  event_date?: string
}

/** Build a new plan from the form. The server replaces the stored plan. */
export const generatePlan = (req: GenerateRequest) =>
  api<PlanRead>("/api/plan/generate", { method: "POST", json: req })

export type TimeOffType = "holiday" | "injury" | "illness"

/** Record a stretch of days off. The plan is rebuilt around it by `regeneratePlan`. */
export const markUnavailable = (start: string, end: string, type: TimeOffType) =>
  api<UnavailableMarked>("/api/plan/mark-unavailable", {
    method: "POST",
    json: { start, end, type, daily_tss: type === "holiday" ? 25 : 0 },
  })

/** Rebuild the rest of the plan from today (honours recorded time off). */
export const regeneratePlan = () => api<PlanRegenerated>("/api/plan/regenerate", { method: "POST", json: {} })

export const getStats = () => api<RiderStats>("/api/rider-stats")

/** Local calendar day as YYYY-MM-DD (the plan stores local dates). */
export const isoDay = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export const currentWeek = (plan: PlanJson | null | undefined, today: string): PlanWeek | undefined =>
  plan?.weeks?.find((w) => w.start <= today && today <= w.end)

export const sessionsOn = (week: PlanWeek | undefined, day: string): PlanSession[] =>
  (week?.sessions ?? []).filter((s) => s.day === day && s.session_type !== "rest")

export const weekSessions = (week: PlanWeek | undefined): PlanSession[] =>
  [...(week?.sessions ?? [])].filter((s) => s.session_type !== "rest").sort((a, b) => a.day.localeCompare(b.day))

export const plannedTss = (sessions: PlanSession[]) => Math.round(sessions.reduce((n, s) => n + (s.tss_estimate || 0), 0))

export const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`)

/** The `{value, source}` readings in /api/rider-stats; null when the app has none. */
export const reading = (r: unknown): number | null => {
  const v = (r as { value?: unknown } | null | undefined)?.value
  return typeof v === "number" ? v : null
}

// ── Plan tools ───────────────────────────────────────────────────────────

export interface DayAvailability {
  hours: number
  type: string
}
export type Availability = Record<string, DayAvailability>

/** The server REPLACES the stored availability with what it receives, so always send the full map. */
export const saveAvailability = (availability: Availability) =>
  api<AvailabilitySaved>("/api/plan/save-availability", { method: "POST", json: { availability } })

export interface RaceRequest {
  date: string
  name: string
  priority: "B" | "C"
  km?: number
  type?: string
}

/** Add a B/C race; the server re-periodizes the plan around it. */
export const addRace = (req: RaceRequest) => api<RaceAdded>("/api/plan/add-race", { method: "POST", json: req })

export const FTP_TEST_TYPES = [
  ["ramp", "Ramp test"],
  ["coggan_20min", "20-minute test"],
  ["sixty_min", "60-minute test"],
  ["cp_test", "CP test"],
] as const

export const setFtpTestType = (date: string, testType: string) =>
  api<FtpTestTypeSet>("/api/plan/ftp-test-type", { method: "POST", json: { date, test_type: testType } })

/** Compare this week's sessions with the rides done. `apply` false only previews. */
export const rematchWeek = (apply: boolean) => api<RematchResult>(`/api/plan/rematch?apply=${apply ? 1 : 0}`, { method: "POST" })

/** Offer another workout for the day. Pass names already seen to get a different one. */
export const previewRedraw = (date: string, seen: string[]) =>
  api<RedrawCandidate>("/api/plan/preview-redraw", { method: "POST", json: { date, exclude_extra: seen } })

export const acceptRedraw = (c: RedrawCandidate) =>
  api<RedrawAccepted>("/api/plan/accept-redraw", {
    method: "POST",
    json: { date: c.day, zwo_file: c.zwo_file, zwo_name: c.zwo_name, variation: c.variation, tss_estimate: c.tss_estimate, duration_min: c.duration_min },
  })

export const revertDeload = () => api<DeloadReverted>("/api/plan/continuous/deload-revert", { method: "POST", json: {} })

// ── Today ────────────────────────────────────────────────────────────────

export const getReadiness = () => api<Readiness>("/api/readiness")
export const getTodaySession = () => api<TodaySession>("/api/today-session")

/** Keep today's adjusted session in the plan (the replacement the readiness check suggested). */
export const acceptAdjusted = (adjusted: { session_type: string; duration_min?: number; tss_estimate?: number; description?: string }, reason: string) =>
  api<TodayPersisted>("/api/today-session/persist", { method: "POST", json: { ...adjusted, reason } })

/** Ride the original session today: switches the readiness caps off until midnight and restores a stored adaptation. */
export const rideOriginal = () => api<CapReverted>("/api/readiness/revert-cap", { method: "POST", json: {} })

export const easeToday = () => api<TierDownApplied>("/api/readiness/apply-tier-down", { method: "POST", json: {} })

export type AdjustScope = "today" | "week" | "day"
/** `dryRun` previews without saving. */
export const autoAdjust = (scope: AdjustScope, dryRun: boolean, severity?: string) =>
  api<AutoAdjustResult>("/api/plan/auto-adjust", { method: "POST", json: { scope, dry_run: dryRun, ...(severity ? { severity } : {}) } })

export const getDailyLog = () => api<DailyLogRead>("/api/daily-log")

export interface DailyLogInput {
  sleep_quality: number
  fatigue: number
  stress: number
  soreness: number
  mood: number
  notes?: string
}
export const saveDailyLog = (entry: DailyLogInput) => api<DailyLogSaved>("/api/daily-log", { method: "POST", json: entry })
