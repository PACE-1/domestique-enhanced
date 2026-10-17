import type { SettingsRead, SettingsSaved, SyncStatus, UpdateCheck, VersionInfo } from "@/api/types"
import { api } from "@/lib/api"

export const getSettings = () => api<SettingsRead>("/api/settings")
export const getSyncStatus = () => api<SyncStatus>("/api/sync/status")
export const getVersion = () => api<VersionInfo>("/api/version")
export const checkUpdate = (force: boolean) => api<UpdateCheck>(`/api/update/check?force=${force ? 1 : 0}`)
export const syncNow = () => api<Record<string, unknown>>("/api/sync", { method: "POST" })

/** Saves only what changed. The server rejects values outside its limits with a message. */
export const saveSettings = (changes: Record<string, number | string>) =>
  api<SettingsSaved>("/api/settings", { method: "POST", json: changes })

export interface RiderForm {
  weight: string
  ftp: string
  lthr: string
  maxHr: string
  targetMode: "power" | "hr"
}

export const formFrom = (s: SettingsRead): RiderForm => ({
  weight: String(s.weight),
  ftp: String(s.ftp),
  lthr: String(s.lthr),
  maxHr: String(s.max_hr),
  targetMode: s.target_mode === "hr" ? "hr" : "power",
})

type Limits = Partial<Record<"ftp" | "weight" | "lthr" | "max_hr", [number, number]>>

/** What to send (only changed fields) and what is wrong with the form, if anything. */
export function diff(s: SettingsRead, f: RiderForm, limits: Limits = {}) {
  const changes: Record<string, number | string> = {}
  const problems: string[] = []
  const nums: [keyof Limits, string, string, number][] = [
    ["weight", "Weight", f.weight, s.weight],
    ["ftp", "FTP", f.ftp, s.ftp],
    ["lthr", "LTHR", f.lthr, s.lthr],
    ["max_hr", "Max HR", f.maxHr, s.max_hr],
  ]
  for (const [key, label, raw, old] of nums) {
    const v = Number(raw)
    if (raw.trim() === "" || !Number.isFinite(v)) { problems.push(`${label} must be a number.`); continue }
    const [lo, hi] = limits[key] ?? [0, Infinity]
    if (v < lo || v > hi) { problems.push(`${label} must be between ${lo} and ${hi}.`); continue }
    if (v !== old) changes[key] = v
  }
  if (!problems.length && Number(f.maxHr) <= Number(f.lthr)) problems.push("Max HR must be above LTHR.")
  if (f.targetMode !== (s.target_mode === "hr" ? "hr" : "power")) changes.target_mode = f.targetMode
  return { changes, problems }
}
