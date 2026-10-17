import { useState } from "react"

import type { RouteSuggestion, RouteSuggestions } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FINISHES, pickFive, suggestRoutes, SURFACES, type RouteWish } from "@/lib/routes"
import { Chips } from "@/screens/Chips"
import { RouteRow } from "@/screens/Routes"

const FIELDS: [keyof Pick<RouteWish, "distMin" | "distMax" | "climbMin" | "climbMax">, string, number, number, number][] = [
  ["distMin", "Shortest (km)", 3, 250, 1],
  ["distMax", "Longest (km)", 3, 250, 1],
  ["climbMin", "Least climbing (m)", 0, 4000, 25],
  ["climbMax", "Most climbing (m)", 0, 4000, 25],
]

/** Describe the ride you want and get a few routes that fit. Ask again for different ones. */
export function RouteFinder() {
  const [w, setW] = useState<RouteWish>({ distMin: 20, distMax: 60, climbMin: 0, climbMax: 1000, surfaces: [], finishes: [], loopOnly: false })
  const [all, setAll] = useState<RouteSuggestions | null>(null)
  const [shown, setShown] = useState<RouteSuggestion[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const find = async () => {
    setBusy(true)
    setError("")
    try {
      const r = await suggestRoutes(w)
      setAll(r)
      setShown(pickFive(r.results))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const hint = all?.empty_hint as { filter_label?: string; would_match?: number } | undefined

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">Find me a route</h2>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          {FIELDS.map(([key, label, min, max, step]) => (
            <Label key={key} className="flex-col items-start gap-1">
              {label}
              <Input type="number" min={min} max={max} step={step} className="w-28" value={w[key]} onChange={(e) => setW({ ...w, [key]: Number(e.target.value) })} />
            </Label>
          ))}
          <Label className="gap-2 pb-1">
            <Checkbox checked={w.loopOnly} onCheckedChange={(v) => setW({ ...w, loopOnly: v === true })} />
            Only suggest loops
          </Label>
        </div>
        <Chips label="Surface" options={SURFACES} value={w.surfaces} onChange={(surfaces) => setW({ ...w, surfaces })} />
        <Chips label="Finish" options={FINISHES} value={w.finishes} onChange={(finishes) => setW({ ...w, finishes })} />
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={find}>
            {busy ? "Looking…" : all ? "Show others" : "Suggest routes"}
          </Button>
        </div>
        {error && <p role="alert" className="text-sm">Couldn’t reach the route server: {error}</p>}
        {all && shown.length === 0 && (
          <p className="text-sm">
            No routes fit.{hint?.filter_label ? ` Drop ${hint.filter_label} to see ${hint.would_match} route${hint.would_match === 1 ? "" : "s"}.` : " Widen the distance or climbing."}
          </p>
        )}
        {shown.length > 0 && (
          <ul className="divide-y">
            {shown.map((s) => (
              <div key={s.route.id}>
                <RouteRow r={s.route} />
                {s.rationale && <p className="pb-2 text-sm text-muted-foreground">{s.rationale} (match {Math.round(s.match_score * 100)}%)</p>}
              </div>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
