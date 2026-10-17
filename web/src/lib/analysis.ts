import type { BanisterValidation, FatigueResistance, PowerCurve, RideSummary, TauFits, WellnessDay } from "@/api/types"
import { api } from "@/lib/api"

export const RANGES = [
  [30, "30 days"],
  [90, "90 days"],
  [180, "6 months"],
  [365, "1 year"],
] as const

export const getFitness = (days: number) => api<WellnessDay[]>(`/api/wellness?days=${days}`)
export const getPowerCurve = (days: number) => api<PowerCurve>(`/api/profile/power-curve?window_days=${days}`)
export const getRides = (limit = 20) => api<RideSummary[]>(`/api/rides?limit=${limit}`)

export interface Series {
  name: string
  color: string // a CSS colour or a Tailwind-independent value
  points: { x: number; y: number }[]
}

/** Maps data to SVG space. Returns the path for each series and the y-range used. */
export function plot(series: Series[], w: number, h: number, pad = 4) {
  const xs = series.flatMap((s) => s.points.map((p) => p.x))
  const ys = series.flatMap((s) => s.points.map((p) => p.y))
  if (!xs.length) return null
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y0 = Math.min(...ys)
  const y1 = Math.max(...ys)
  const sx = (x: number) => pad + (x1 === x0 ? 0.5 : (x - x0) / (x1 - x0)) * (w - 2 * pad)
  const sy = (y: number) => h - pad - (y1 === y0 ? 0.5 : (y - y0) / (y1 - y0)) * (h - 2 * pad)
  return {
    y0,
    y1,
    paths: series.map((s) => ({ name: s.name, color: s.color, d: s.points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ") })),
    zeroY: y0 < 0 && y1 > 0 ? sy(0) : null,
  }
}

export const fmtDuration = (s: number) => (s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`)

export const getTauFits = () => api<TauFits>("/api/profile/tau-fits")
export const getBanister = (refresh: boolean) => api<BanisterValidation>(`/api/profile/banister-validation${refresh ? "?refresh=1" : ""}`)
/** Only 1500 and 2000 kJ are valid thresholds; the server answers 422 for anything else. */
export const getFatigue = (kj: 1500 | 2000, refresh: boolean) =>
  api<FatigueResistance>(`/api/profile/fatigue-resistance?kj_threshold=${kj}${refresh ? "&refresh=1" : ""}`)
