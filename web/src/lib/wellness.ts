import type { Backfill3d, EventProjection, Fitness3dStatus, FtpHistory, HrvImported, HrvPromptDismissed, HrvPromptStatus, HrvSaved, MetricPoint, MigrationResult, RetestSnoozed } from "@/api/types"
import { api } from "@/lib/api"

export const saveManualHrv = (rmssd: number, date?: string) => api<HrvSaved>("/api/wellness/manual-hrv", { method: "POST", json: { rmssd, ...(date ? { date } : {}) } })

/** HRV4Training CSV: needs `date` and `rmssd` columns. */
export const importHrvCsv = (file: File) => {
  const form = new FormData()
  form.append("file", file)
  return api<HrvImported>("/api/wellness/import-hrv4training", { method: "POST", form })
}

export const getHrvPrompt = () => api<HrvPromptStatus>("/api/wellness/hrv-recording-status")
export const dismissHrvPrompt = (level: "version" | "permanent") => api<HrvPromptDismissed>("/api/wellness/hrv-recording-dismiss", { method: "POST", json: { level } })

export const snoozeRetest = () => api<RetestSnoozed>("/api/retest-nudge/snooze", { method: "POST", json: {} })

export type Metric = "weight" | "ftp" | "w_per_kg" | "vo2max"
export const getMetric = (metric: Metric, days: number) => api<MetricPoint[]>(`/api/metrics/history?metric=${metric}&days=${days}`)

export const getFtpHistory = () => api<FtpHistory>("/api/profile/ftp-history")
export const getProjection = () => api<EventProjection>("/api/event/projection")
export const get3dStatus = () => api<Fitness3dStatus>("/api/wellness/3d-fitness-status")
export const backfill3d = () => api<Backfill3d>("/api/wellness/backfill-3d-fitness", { method: "POST" })
export const getMigration = () => api<MigrationResult>("/api/migrations/last-run-result")
