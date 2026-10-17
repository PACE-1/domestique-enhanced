import { useCallback } from "react"

import type { MetricPoint } from "@/api/types"
import { getMetric, type Metric } from "@/lib/wellness"
import { Panel, useLoad } from "@/screens/panel"
import { Spark } from "@/screens/Spark"

const ITEMS: [Metric, string, string, number, string][] = [
  ["weight", "Weight", "kg", 1, "var(--chart-2)"],
  ["ftp", "FTP", "W", 0, "var(--primary)"],
  ["w_per_kg", "W/kg", "", 2, "var(--chart-3)"],
  ["vo2max", "VO2max", "", 1, "var(--chart-5)"],
]

export function BodyPerf() {
  const fetcher = useCallback(async () => {
    const out = await Promise.all(ITEMS.map(([m]) => getMetric(m, m === "vo2max" ? 365 : 180)))
    return Object.fromEntries(ITEMS.map(([m], i) => [m, out[i]])) as Record<Metric, MetricPoint[]>
  }, [])
  const [load, retry] = useLoad(fetcher)
  return (
    <Panel title="Body and performance" load={load} retry={retry}>
      {(d) =>
        ITEMS.every(([m]) => d[m].length === 0) ? (
          <p className="text-sm text-muted-foreground">No history yet. It builds as you save settings and sync rides.</p>
        ) : (
          <div className="flex flex-wrap gap-6">
            {ITEMS.map(([m, label, unit, digits, color]) => {
              const v = d[m].map((p) => p.value)
              const last = v.at(-1)
              return (
                <div key={m} className="space-y-1 text-center">
                  <div className="text-xl font-semibold">{last === undefined ? "—" : `${last.toFixed(digits)}${unit ? ` ${unit}` : ""}`}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <Spark values={v} label={`${label} trend`} color={color} />
                </div>
              )
            })}
          </div>
        )
      }
    </Panel>
  )
}
