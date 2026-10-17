import type { RegionsList, RoutesList } from "@/api/types"
import { api } from "@/lib/api"

export interface RouteQuery {
  search: string
  region: string // "" = all
  minKm: number | null
  maxKm: number | null
  loopOnly: boolean
}

export const ROUTE_PAGE = 60

export const listRoutes = (q: RouteQuery) => {
  const p = new URLSearchParams({ limit: String(ROUTE_PAGE) })
  if (q.search.trim()) p.set("search", q.search.trim())
  if (q.region) p.set("region", q.region)
  if (q.minKm !== null) p.set("min_km", String(q.minKm))
  if (q.maxKm !== null) p.set("max_km", String(q.maxKm))
  if (q.loopOnly) p.set("loop_only", "true")
  return api<RoutesList>(`/api/routes?${p}`)
}

export const getRegions = () => api<RegionsList>("/api/routes/regions")

/** The .crs course file for a route, or null when the summary doesn't say which file it is. */
export const courseUrl = (r: { crs_region?: string | null; file?: string | null }) =>
  r.crs_region && r.file ? `/api/course/${encodeURIComponent(r.crs_region)}/${encodeURIComponent(r.file)}/download` : null
