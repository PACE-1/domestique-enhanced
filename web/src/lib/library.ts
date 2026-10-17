import type { PickerResult, WorkoutDetail, WorkoutRow } from "@/api/types"
import { api, apiFull } from "@/lib/api"

export interface WorkoutQuery {
  search: string
  minDuration: number | null
  maxDuration: number | null
  sort: string
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
  const { data, headers } = await apiFull<WorkoutRow[]>(`/api/workouts?${p}`)
  const total = Number(headers.get("X-Library-Total"))
  return { rows: data, total: Number.isFinite(total) && headers.get("X-Library-Total") !== null ? total : null }
}

export const getWorkout = (category: string, file: string) =>
  api<WorkoutDetail>(`/api/workout/${encodeURIComponent(category)}/${encodeURIComponent(file)}`)

export const downloadUrl = (file: string) => `/api/workout/download/${encodeURIComponent(file)}`

export const getPicker = (feel: number, durationMin: number) =>
  api<PickerResult>(`/api/picker?subjective=${feel}&duration=${durationMin}`)

export const minutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")} min` : `${Math.round(m)} min`)
