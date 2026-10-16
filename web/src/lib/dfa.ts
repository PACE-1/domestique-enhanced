import { api } from "@/lib/api"

export interface Threshold {
  hr: number | null
  power: number | null
  r2_hr?: number | null
  r2_power?: number | null
  r2_hr_median?: number
  r2_power_median?: number
  n_hr?: number
  n_power?: number
  date_span?: [string, string]
}
export interface DfaRide {
  id: string
  date?: string
  name?: string
  duration_min?: number | null
  avg_hr?: number | null
  alpha1_avg?: number | null
  zone_minutes?: { z1: number; z2: number; z3: number } | null
  hrvt1?: Threshold | null
  hrvt1_note?: string
  hrvt2?: Threshold | null
  hrvt2_note?: string
}
export interface DfaRides {
  aggregate?: {
    hrvt1?: Threshold | null
    hrvt2?: Threshold | null
    agg_min_r2?: number
    n_excluded_decoupling?: number
  }
  rides?: DfaRide[]
  n_total?: number
  n_computed?: number
  n_stale_version?: number
}
export interface BackfillStatus {
  state?: string
  task_id?: string
  augmented?: number
  candidates?: number
  computed?: number
  no_rr_data?: number
  failed?: number
  current?: string
}
export interface SyncProgress {
  state?: string
  done?: number
  total?: number
}

export const R2_TOOLTIP =
  "r² = how well α1 tracked this channel (HR or power) on this ride. 1.0 = perfect linear trend " +
  "through the threshold; below 0.50 means the fit is noisy — treat the number as indicative, not " +
  "exact. Low-r² rides are shown but excluded from the aggregate zones."

export function r2Quality(r2: number | null | undefined): { cls: string; label: string } {
  if (r2 == null) return { cls: "text-muted-foreground", label: "" }
  if (r2 >= 0.6) return { cls: "text-green-500", label: "good" }
  if (r2 >= 0.45) return { cls: "text-yellow-500", label: "moderate" }
  return { cls: "text-red-500", label: "low" }
}

export const isTerminal = (state?: string) => state === "done" || state === "cancelled" || state === "error"

export const getRides = () => api<DfaRides>("/api/profile/dfa-rides")
export const startBackfill = (migrate = false) =>
  api<{ task_id?: string }>(`/api/profile/dfa-backfill${migrate ? "?migrate=1" : ""}`, { method: "POST" })
export const backfillStatus = (taskId: string) =>
  api<BackfillStatus>(`/api/profile/dfa-backfill/status?task_id=${encodeURIComponent(taskId)}`)
export const cancelBackfill = (taskId: string) =>
  api(`/api/profile/dfa-backfill/cancel?task_id=${encodeURIComponent(taskId)}`, { method: "POST" })
export const syncProgress = () => api<SyncProgress>("/api/sync/progress")

export const BACKFILL_KEY = "dfa_backfill_last_run_at"
export const MIGRATE_KEY = "dfa_migrate_last_run_at"
export const MIGRATE_THROTTLE_MS = 10 * 60 * 1000
