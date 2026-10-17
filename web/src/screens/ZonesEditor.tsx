import { useState } from "react"

import type { ZoneBand } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { saveZones, zoneProblem } from "@/lib/settings"

/** Edit the low and high of each zone, or go back to the automatic zones. */
export function ZonesEditor({ kind, zones, unit, onSaved, onCancel }: { kind: "power" | "hr"; zones: ZoneBand[]; unit: string; onSaved: () => void; onCancel: () => void }) {
  const [rows, setRows] = useState(zones.map((z) => ({ zone: z.zone, name: z.name, low: String(z.low), high: z.high >= 9999 ? "3000" : String(z.high) })))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const problem = zoneProblem(rows)
  const set = (i: number, k: "low" | "high", v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const run = async (zonesOrNull: Parameters<typeof saveZones>[1]) => {
    setBusy(true)
    setError("")
    try {
      await saveZones(kind, zonesOrNull)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  const label = kind === "power" ? "Power" : "Heart-rate"
  return (
    <div className="space-y-2 text-sm">
      <h3 className="text-xs font-semibold text-muted-foreground">{label} zones ({unit})</h3>
      {rows.map((r, i) => (
        <div key={r.zone} className="flex items-center gap-2">
          <span className="w-40 text-muted-foreground">{r.name || r.zone}</span>
          <Input type="number" aria-label={`${label} ${r.zone} low`} className="w-24" value={r.low} onChange={(e) => set(i, "low", e.target.value)} />
          <span>to</span>
          <Input type="number" aria-label={`${label} ${r.zone} high`} className="w-24" value={r.high} onChange={(e) => set(i, "high", e.target.value)} />
        </div>
      ))}
      {problem && <p>{problem}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !!problem} onClick={() => run(rows.map((r) => ({ zone: r.zone, name: r.name, low: Number(r.low), high: Number(r.high) })))}>
          Save zones
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(null)}>
          Use automatic zones
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {error && <p role="alert">Couldn’t save the zones: {error}</p>}
    </div>
  )
}
