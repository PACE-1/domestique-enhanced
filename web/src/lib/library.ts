import type { PickerResult, WorkoutTags, WorkoutDetail, WorkoutRow } from "@/api/types"
import { api, apiFull } from "@/lib/api"

export interface WorkoutQuery {
  search: string
  minDuration: number | null
  maxDuration: number | null
  sort: string
  contentClass: string
  tags: string[]
}

/** The workout types the server can classify a file as, grouped as the library offers them. */
export const TYPES: [string, [string, string][]][] = [
  ["Aerobic", [["recovery", "Recovery"], ["endurance", "Endurance"], ["endurance_intervals", "Endurance + strides"]]],
  ["Tempo and sweet spot", [["tempo", "Tempo"], ["tempo_intervals", "Tempo intervals"], ["tempo_ladder", "Tempo ladder"], ["sweet_spot", "Sweet spot"], ["sweet_spot_ladder", "Sweet spot ladder"]]],
  ["Threshold", [["threshold", "Threshold"], ["threshold_ladder", "Threshold ladder"], ["over_under", "Over-unders"]]],
  ["VO2 and anaerobic", [["vo2max", "VO2max"], ["vo2_short", "Short VO2"], ["vo2_ladder", "VO2 ladder"], ["anaerobic", "Anaerobic"], ["neuromuscular", "Sprint"]]],
  ["Tests", [["ftp_test", "FTP test"]]],
]

export const getTags = () => api<WorkoutTags>("/api/workouts/tags").then((r) => r.tags ?? [])

/** Workouts that suit gravel and cobbles: steady, sustained, low-cadence work, judged by protocol and name. */
const GRAVEL_PROTOCOLS = ["tempo", "sweet spot", "endurance", "threshold"]
const GRAVEL_NAMES = ["gravel", "cobble", "strade", "roubaix", "big gear", "pave"]
export function suitsGravel(w: WorkoutRow) {
  const proto = (w.Protocol ?? "").toLowerCase()
  const name = (w.Name ?? "").toLowerCase()
  return GRAVEL_PROTOCOLS.some((p) => proto.includes(p)) || GRAVEL_NAMES.some((n) => name.includes(n))
}

export const SORTS = [
  ["relevance", "Best match"],
  ["score_desc", "Highest score"],
  ["duration_asc", "Shortest first"],
  ["duration_desc", "Longest first"],
  ["name_asc", "Name A to Z"],
] as const

export const PAGE = 60

/** One page of the library plus the size of the whole library (the server's X-Library-Total header). */
export async function listWorkouts(q: WorkoutQuery): Promise<{ rows: WorkoutRow[]; total: number | null }> {
  const p = new URLSearchParams({ limit: String(PAGE), sort: q.sort })
  if (q.search.trim()) p.set("search", q.search.trim())
  if (q.minDuration !== null) p.set("duration_min", String(q.minDuration))
  if (q.maxDuration !== null) p.set("duration_max", String(q.maxDuration))
  if (q.contentClass) p.set("content_class", q.contentClass)
  if (q.tags.length) p.set("tags", q.tags.join(","))
  const { data, headers } = await apiFull<WorkoutRow[]>(`/api/workouts?${p}`)
  const total = Number(headers.get("X-Library-Total"))
  return { rows: data, total: Number.isFinite(total) && headers.get("X-Library-Total") !== null ? total : null }
}

export const getWorkout = (category: string, file: string) =>
  api<WorkoutDetail>(`/api/workout/${encodeURIComponent(category)}/${encodeURIComponent(file)}`)

export interface Outdoor {
  on: boolean
  transitMin: number
  spinMin: number
}

/** The outdoor variant adds an off-plan ride to the climb and an easy spin home; those minutes are not counted in planned load. */
export const downloadUrl = (file: string, outdoor?: Outdoor) =>
  outdoor?.on
    ? `/api/download/zwo/${encodeURIComponent(file)}?outdoor=1&transit_min=${outdoor.transitMin}&spin_min=${outdoor.spinMin}`
    : `/api/workout/download/${encodeURIComponent(file)}`

export const getPicker = (feel: number, durationMin: number) =>
  api<PickerResult>(`/api/picker?subjective=${feel}&duration=${durationMin}`)

export const minutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")} min` : `${Math.round(m)} min`)
