import type { PlanJson, PlanRead, PlanSession, PlanWeek, ProgrammeSummary, RiderStats, SessionDismissed, SessionMoved } from "@/api/types"
import { api } from "@/lib/api"

export const getPlan = () => api<PlanRead>("/api/plan")
export const getSummary = () => api<ProgrammeSummary>("/api/programme/summary")
/** Dismiss (or restore) the session on a day. The server applies it to every session on that date. */
export const dismissSession = (date: string, undo = false) =>
  api<SessionDismissed>("/api/plan/dismiss-session", { method: "POST", json: { date, undo } })

/** Move the session on `date` to `newDate`. Onto a day with one session the two swap; a ridden or crowded day is refused. */
export const moveSession = (date: string, newDate: string) =>
  api<SessionMoved>("/api/plan/move-session", { method: "POST", json: { date, new_date: newDate } })

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
