import { useCallback, useState } from "react"

import type { Fitness3dStatus, WellnessDay } from "@/api/types"
import { Button } from "@/components/ui/button"
import { getFitness } from "@/lib/analysis"
import { backfill3d, get3dStatus } from "@/lib/wellness"
import { LineChart } from "@/screens/Chart"
import { Panel, useLoad } from "@/screens/panel"

const SYSTEMS: [keyof WellnessDay, string, string, string][] = [
  ["cp_fitness", "Aerobic (critical power fitness)", "W", "var(--chart-2)"],
  ["w_prime_fitness", "Anaerobic work capacity (W′ fitness)", "kJ", "var(--chart-5)"],
  ["pmax_fitness", "Sprint power (Pmax fitness)", "W", "var(--chart-3)"],
]

/** How each energy system is trending, from the rider's own power data. Needs a one-off backfill on older rides. */
export function EnergySystems() {
  const fetcher = useCallback(async () => ({ rows: await getFitness(180), status: await get3dStatus() }), [])
  const [load, retry, refresh] = useLoad<{ rows: WellnessDay[]; status: Fitness3dStatus }>(fetcher)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const [error, setError] = useState("")
  const run = async () => {
    setBusy(true)
    setError("")
    setMsg("")
    try {
      const r = await backfill3d()
      setMsg(`${r.backfilled} ride${r.backfilled === 1 ? "" : "s"} processed${r.failed ? `, ${r.failed} failed` : ""}.`)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel title="Energy systems" load={load} retry={retry}>
      {({ rows, status }) => {
        const charts = SYSTEMS.map(([key, name, unit, color]) => ({
          key, name, unit, color,
          points: rows.flatMap((r, i) => (typeof r[key] === "number" ? [{ x: i, y: r[key] as number }] : [])),
        })).filter((c) => c.points.length >= 2)
        const missing = status.rides_with_ss < status.rides_total_post_v106
        return (
          <div className="space-y-3 text-sm">
            {charts.length === 0 ? <p>No energy-system data yet.</p> : charts.map((c) => (
              <div key={c.key}>
                <h3 className="text-xs font-semibold text-muted-foreground">{c.name}</h3>
                <LineChart series={[{ name: c.name, color: c.color, points: c.points }]} unit={c.unit} summary={`${c.name} over the last ${rows.length} days`} />
              </div>
            ))}
            <p className="text-muted-foreground">
              {status.rides_with_ss} of {status.rides_total_post_v106} rides have energy-system data.
            </p>
            {missing && (
              <Button size="sm" variant="outline" disabled={busy} onClick={run}>
                {busy ? "Working…" : "Fill in the missing rides"}
              </Button>
            )}
            {msg && <p role="status">{msg}</p>}
            {error && <p role="alert">Couldn’t do that: {error}</p>}
          </div>
        )
      }}
    </Panel>
  )
}
