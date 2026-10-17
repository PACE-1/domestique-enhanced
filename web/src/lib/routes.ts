import type { RegionsList, RouteSuggestion, RouteSuggestions, RoutesList } from "@/api/types"
import { api } from "@/lib/api"

export interface RouteQuery {
  search: string
  region: string // "" = all
  minKm: number | null
  maxKm: number | null
  loopOnly: boolean
  source: "any" | "real" | "virtual"
  surfaces: string[]
  categories: string[]
}

export const SURFACES = [["asphalt", "Asphalt"], ["gravel", "Gravel"], ["cobble", "Cobble"]] as const
export const CATEGORIES = [["flat", "Flat"], ["cat5", "Cat 5"], ["cat4", "Cat 4"], ["cat3", "Cat 3"], ["cat2", "Cat 2"], ["cat1", "Cat 1"], ["hc", "HC"]] as const
export const FINISHES = [["flat", "Flat finish"], ["summit", "Summit finish"], ["wall", "Steep wall"], ["sprint_flat", "Sprint finish"]] as const

export const ROUTE_PAGE = 60

export const listRoutes = (q: RouteQuery) => {
  const p = new URLSearchParams({ limit: String(ROUTE_PAGE) })
  if (q.search.trim()) p.set("search", q.search.trim())
  if (q.region) p.set("region", q.region)
  if (q.minKm !== null) p.set("min_km", String(q.minKm))
  if (q.maxKm !== null) p.set("max_km", String(q.maxKm))
  if (q.loopOnly) p.set("loop_only", "true")
  if (q.source !== "any") p.set("source", q.source)
  if (q.surfaces.length) p.set("surface", q.surfaces.join(","))
  if (q.categories.length) p.set("category", q.categories.join(","))
  return api<RoutesList>(`/api/routes?${p}`)
}

export const getRegions = () => api<RegionsList>("/api/routes/regions")

/** The .crs course file for a route, or null when the summary doesn't say which file it is. */
export const courseUrl = (r: { crs_region?: string | null; file?: string | null }) =>
  r.crs_region && r.file ? `/api/course/${encodeURIComponent(r.crs_region)}/${encodeURIComponent(r.file)}/download` : null

export interface RouteWish {
  distMin: number
  distMax: number
  climbMin: number
  climbMax: number
  surfaces: string[]
  finishes: string[]
  loopOnly: boolean
}

/** Ask for 20 strong matches, so asking again can show others. The server needs min <= max. */
export const suggestRoutes = (w: RouteWish) =>
  api<RouteSuggestions>("/api/routes/suggest", {
    method: "POST",
    json: {
      distance_km: { min: Math.min(w.distMin, w.distMax), max: Math.max(w.distMin, w.distMax) },
      climb_m: { min: Math.min(w.climbMin, w.climbMax), max: Math.max(w.climbMin, w.climbMax) },
      climbs: "include_any_climb",
      surface: w.surfaces.length ? w.surfaces : null,
      finish: w.finishes.length ? w.finishes : null,
      loop_only: w.loopOnly,
      max_results: 20,
    },
  })

/** Five of the strong matches: three from the best ten, two from the rest of the twenty, best first. */
export function pickFive(all: RouteSuggestion[], random: () => number = Math.random): RouteSuggestion[] {
  if (all.length <= 5) return all
  const pool = all.slice()
  const picked: RouteSuggestion[] = []
  const take = (to: number) => {
    const end = Math.min(to, pool.length)
    if (end > 0) picked.push(pool.splice(Math.floor(random() * end), 1)[0])
  }
  for (let i = 0; i < 3; i++) take(10)
  for (let i = 0; i < 2; i++) take(20)
  return picked.sort((a, b) => b.match_score - a.match_score)
}
