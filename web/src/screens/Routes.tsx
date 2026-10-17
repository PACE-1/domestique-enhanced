import { useEffect, useState } from "react"

import type { RegionsList, RouteSummary, RoutesList } from "@/api/types"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { courseUrl, getRegions, listRoutes, ROUTE_PAGE, type RouteQuery } from "@/lib/routes"

/** Elevation against distance. `points` are [km, metres] pairs. */
export function Elevation({ points, label }: { points: number[][]; label: string }) {
  if (points.length < 2) return null
  const kms = points.map((p) => p[0])
  const els = points.map((p) => p[1])
  const maxKm = Math.max(...kms) || 1
  const lo = Math.min(...els)
  const span = Math.max(...els) - lo || 1
  const d = points.map((p, i) => `${i ? "L" : "M"}${((p[0] / maxKm) * 300).toFixed(1)},${(58 - ((p[1] - lo) / span) * 54).toFixed(1)}`).join(" ")
  return (
    <svg role="img" aria-label={label} viewBox="0 0 300 60" className="h-14 w-full">
      <path d={`${d} L300,60 L0,60 Z`} className="fill-primary/20" />
      <path d={d} className="fill-none stroke-primary" strokeWidth={1.5} />
    </svg>
  )
}

function RouteRow({ r }: { r: RouteSummary }) {
  const [open, setOpen] = useState(false)
  const url = courseUrl(r)
  const mix = r.surface_mix_pct as Record<string, number> | null | undefined
  return (
    <li className="space-y-2 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="text-left font-medium underline-offset-2 hover:underline" aria-expanded={open} onClick={() => setOpen(!open)}>
          {r.name}
        </button>
        <span className="text-muted-foreground">
          {r.distance_km} km · {Math.round(r.climb_m)} m climbing{r.est_tss ? ` · ~${Math.round(r.est_tss)} TSS` : ""}
        </span>
      </div>
      {open && (
        <div className="space-y-2">
          <Elevation points={r.preview_profile} label={`Elevation profile of ${r.name}, ${r.distance_km} km, ${Math.round(r.climb_m)} m climbing`} />
          <p className="text-muted-foreground">
            {[r.region.replace(/_/g, " "), r.terrain, r.primary_surface, r.loop ? "loop" : null, r.max_grade != null ? `max grade ${r.max_grade}%` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {mix && (
            <p className="text-muted-foreground">
              Surface: {Object.entries(mix).filter(([, v]) => v > 0).map(([k, v]) => `${v}% ${k}`).join(", ")}
            </p>
          )}
          {url && (
            <a href={url} download className={buttonVariants({ size: "sm", variant: "outline" })}>
              Download course (.crs)
            </a>
          )}
        </div>
      )}
    </li>
  )
}

type Load = { state: "loading" } | { state: "ok"; data: RoutesList } | { state: "error"; message: string }
const num = (v: string) => (v === "" ? null : Number(v))

export function Routes() {
  const [q, setQ] = useState<RouteQuery>({ search: "", region: "", minKm: null, maxKm: null, loopOnly: false })
  const [applied, setApplied] = useState(q)
  const [load, setLoad] = useState<Load>({ state: "loading" })
  const [regions, setRegions] = useState<RegionsList | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    getRegions().then(setRegions, () => setRegions(null)) // the filter is optional: the list still works without it
  }, [])
  useEffect(() => {
    const t = setTimeout(() => setApplied(q), 300)
    return () => clearTimeout(t)
  }, [q])
  useEffect(() => {
    let live = true
    setLoad({ state: "loading" })
    listRoutes(applied).then(
      (data) => live && setLoad({ state: "ok", data }),
      (e: unknown) => live && setLoad({ state: "error", message: e instanceof Error ? e.message : String(e) }),
    )
    return () => { live = false }
  }, [applied, attempt])

  const badRange = q.minKm !== null && q.maxKm !== null && q.minKm > q.maxKm
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">Routes and climbs</h2>
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <Label className="flex-col items-start gap-1">
              Search
              <Input type="search"  value={q.search} onChange={(e) => setQ({ ...q, search: e.target.value })} />
            </Label>
            <Label className="flex-col items-start gap-1">
              Region
              <NativeSelect  value={q.region} onChange={(e) => setQ({ ...q, region: e.target.value })}>
                <option value="">All regions</option>
                {regions?.worlds.map((w) => (
                  <option key={w.region} value={w.region}>
                    {w.title} ({w.count})
                  </option>
                ))}
                {regions?.real_world_meta?.regions.map((w) => (
                  <option key={w.region} value={w.region}>
                    {w.title} ({w.count})
                  </option>
                ))}
              </NativeSelect>
            </Label>
            <Label className="flex-col items-start gap-1">
              From (km)
              <Input type="number" min={0} className="w-24" value={q.minKm ?? ""} onChange={(e) => setQ({ ...q, minKm: num(e.target.value) })} />
            </Label>
            <Label className="flex-col items-start gap-1">
              To (km)
              <Input type="number" min={0} className="w-24" value={q.maxKm ?? ""} onChange={(e) => setQ({ ...q, maxKm: num(e.target.value) })} />
            </Label>
            <Label className="flex items-center gap-2 pb-1">
              <Checkbox checked={q.loopOnly} onCheckedChange={(on) => setQ({ ...q, loopOnly: on })} />
              Loops only
            </Label>
          </div>
          {badRange && <p className="text-sm">“From” is longer than “To”.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4">
          {load.state === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
          {load.state === "error" && (
            <div role="alert" className="text-sm">
              <p>Couldn’t load routes: {load.message}</p>
              <Button className="mt-2" size="sm" variant="outline" onClick={() => setAttempt(attempt + 1)}>
                Retry
              </Button>
            </div>
          )}
          {load.state === "ok" &&
            (load.data.routes.length === 0 ? (
              <p className="text-sm">No routes match.</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  Showing {load.data.returned} of {load.data.total_matching}
                  {load.data.total_matching > ROUTE_PAGE ? ". Narrow the search to see others." : ""}
                </p>
                <ul className="divide-y">
                  {load.data.routes.map((r) => (
                    <RouteRow key={r.id} r={r} />
                  ))}
                </ul>
              </>
            ))}
        </CardContent>
      </Card>
    </div>
  )
}
