import type { PlanJson, PlanRead, PlanRegenerated, PlanSession, PlanWeek, ProgrammeSummary, RiderStats, SessionDismissed, SessionMoved, SessionSwapped, UnavailableMarked } from "@/api/types"
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
