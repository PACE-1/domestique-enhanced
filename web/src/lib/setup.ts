import type { IcuConnection } from "@/api/types"
import { api } from "@/lib/api"

export const COLORS = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ef4444", "#eab308", "#06b6d4", "#ec4899"]

export type TargetMode = "power" | "hr"
// Field keys keep the legacy element ids so "touched" tracking reads the same.
export type FieldKey = "ftp" | "weight" | "lthr" | "max-hr" | "age" | "sex" | "cp" | "wprime"
export type Values = Record<FieldKey, string>

export const DEFAULTS: Values = {
  ftp: "200", weight: "70", lthr: "170", "max-hr": "190", age: "", sex: "", cp: "", wprime: "",
}

// Untouched fields are omitted from the save payload: no fabricated values, no fake FTP-test rows.
export function buildSavePayload(
  values: Values,
  touched: ReadonlySet<FieldKey>,
  targetMode: TargetMode,
  targetModeTouched: boolean,
): Record<string, number | string> {
  const out: Record<string, number | string> = {}
  const floats: [FieldKey, string][] = [["ftp", "ftp"], ["weight", "weight"], ["lthr", "lthr"], ["max-hr", "max_hr"]]
  for (const [key, name] of floats) {
    const v = parseFloat(values[key])
    if (touched.has(key) && !isNaN(v)) out[name] = v
  }
  const ints: [FieldKey, string][] = [["age", "age"], ["cp", "cp"], ["wprime", "wprime_j"]]
  for (const [key, name] of ints) {
    const v = parseInt(values[key], 10)
    if (touched.has(key) && !isNaN(v)) out[name] = v
  }
  if (targetModeTouched) out.target_mode = targetMode
  if (touched.has("sex")) out.sex = values.sex
  return out
}

export type Limits = Partial<Record<"ftp" | "weight" | "lthr" | "max_hr" | "age" | "cp" | "wprime_j", [number, number]>>

export const getLimits = () => api<Limits>("/api/setup/limits")

export const createProfile = (name: string, color: string) =>
  api<{ id: string; warning?: string }>("/api/profiles/create", { method: "POST", json: { name, color } })

export const activateProfile = (id: string) =>
  api<{ active: string }>("/api/profiles/switch", { method: "POST", json: { id } })

export const saveSetup = (payload: Record<string, number | string>) =>
  api("/api/setup/save", { method: "POST", json: payload })

export type { IcuConnection } from "@/api/types"
export const getIcuConnection = () => api<IcuConnection>("/api/icu/connection")

const WIZARD_KEY = "ps_wizard"
// Same sessionStorage key as the legacy wizard: the OAuth round-trip reloads the page.
export const stashWizard = (createdId: string) =>
  sessionStorage.setItem(WIZARD_KEY, JSON.stringify({ createdId, step: 3 }))
export function readWizard(): string | null {
  try {
    return JSON.parse(sessionStorage.getItem(WIZARD_KEY) || "null")?.createdId ?? null
  } catch {
    return null
  }
}
export const clearWizard = () => sessionStorage.removeItem(WIZARD_KEY)

// The callback appends ?icu=... to return_to, and a query inside a #fragment is lost, so return to /v2/?wizard=.
export const ICU_RETURN_TO = "/v2/?wizard=profile-setup"
