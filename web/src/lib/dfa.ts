import type { BackfillStatus, DfaRides, DfaSnapshot, SyncProgress } from "@/api/types"
import { api } from "@/lib/api"

export type { BackfillStatus, DfaRide, DfaRides, DfaThreshold as Threshold, SyncProgress } from "@/api/types"

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

export const isTerminal = (state?: string | null) => state === "done" || state === "cancelled" || state === "error"

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

/** The latest computed DFA α1, for the Home page. */
export const getSnapshot = () => api<DfaSnapshot>("/api/profile/dfa-alpha1")
