import type { PlanAutoRecalc, CalendarRead, DailyAdapt, EntryScan, IcuRaces, PlanPreview, PlanReforecasted, PlanUpdated, WorkoutPushed } from "@/api/types"
import { api } from "@/lib/api"
import type { GenerateRequest } from "@/lib/home"

export const getCalendar = () => api<CalendarRead>("/api/calendar")
/** The plan rebuilds itself when it is over a week old; this is asked when the plan page opens. */
export const autoRecalc = () => api<PlanAutoRecalc>("/api/plan/auto-recalc", { method: "POST" })
export const getDailyAdapt = () => api<DailyAdapt>("/api/plan/daily-adapt")

/** The plan-shaping parts of the form, as the preview and ride scan read them. */
function planQuery(r: Pick<GenerateRequest, "goal" | "plan_weeks" | "hours_per_week" | "event_date" | "start_date" | "phase_weeks">) {
  const p = new URLSearchParams({ goal: r.goal, plan_weeks: String(r.plan_weeks), hours_per_week: String(r.hours_per_week) })
  if (r.event_date) p.set("event_date", r.event_date)
  if (r.start_date) p.set("start_date", r.start_date)
  if (r.phase_weeks) p.set("phase_weeks", JSON.stringify(r.phase_weeks))
  return p
}
export const previewPlan = (r: Parameters<typeof planQuery>[0]) => api<PlanPreview>(`/api/plan/preview?${planQuery(r)}`)
export const scanRides = (r: Pick<GenerateRequest, "goal" | "plan_weeks" | "hours_per_week" | "event_date">) => api<EntryScan>(`/api/plan/entry-scan?${planQuery(r)}`)

/** Re-fit the plan to how training has gone: rebuilds after a long gap, otherwise nudges what is coming. */
export const updatePlan = () => api<PlanUpdated>("/api/plan/update", { method: "POST" })
export const reforecastPlan = () => api<PlanReforecasted>("/api/plan/reforecast", { method: "POST", json: {} })

export const getIcuRaces = () => api<IcuRaces>("/api/icu/races")
export const pushWorkout = (zwoFile: string, date: string, source: "planner" | "library" = "planner") =>
  api<WorkoutPushed>("/api/calendar/push-workout", { method: "POST", json: { source, zwo_file: zwoFile, date } })

export const zwoUrl = (file: string) => `/api/download/zwo/${encodeURIComponent(file)}`
export const fitWorkoutUrl = (zwoFile: string, name: string, sessionType: string, durationMin: number) =>
  `/api/export/fit-workout?${new URLSearchParams({ zwo_file: zwoFile, name, session_type: sessionType, duration_min: String(Math.round(durationMin)) })}`
export const summaryImageUrl = "/api/programme/summary/png"

export const addDaysIso = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
