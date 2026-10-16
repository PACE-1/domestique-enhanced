import { useCallback, useEffect, useRef, useState } from "react"

import { useShell } from "@/components/AppShell"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  BACKFILL_KEY,
  MIGRATE_KEY,
  MIGRATE_THROTTLE_MS,
  R2_TOOLTIP,
  backfillStatus,
  cancelBackfill,
  getRides,
  isTerminal,
  r2Quality,
  startBackfill,
  syncProgress,
  type BackfillStatus,
  type DfaRide,
  type DfaRides,
  type SyncProgress,
  type Threshold,
} from "@/lib/dfa"

type View = "aggregate" | "perride"
type Status =
  | { kind: "none" }
  | { kind: "text"; text: string; error?: boolean }
  | { kind: "sync"; progress: SyncProgress }
  | { kind: "backfill"; status: BackfillStatus }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function Dfa() {
  const { lsKey } = useShell()
  const [view, setView] = useState<View>("aggregate")
  const [data, setData] = useState<DfaRides | null>(null)
  const [status, setStatus] = useState<Status>({ kind: "text", text: "Loading DFA data…" })
  const alive = useRef(true)

  const reload = useCallback(async () => {
    const d = await getRides()
    if (alive.current) setData(d)
    return d
  }, [])

  useEffect(() => {
    alive.current = true
    const stillHere = () => alive.current
    const pollBackfill = async (taskId: string) => {
      for (let i = 0; i < 240 && stillHere(); i++) {
        let s: BackfillStatus
        try {
          s = await backfillStatus(taskId)
        } catch {
          return null
        }
        setStatus({ kind: "backfill", status: { ...s, task_id: taskId } })
        if (isTerminal(s.state)) return s
        await sleep(Number(s.augmented || 0) === 0 && i < 4 ? 250 : 750)
      }
      return null
    }
    const refreshAfter = async (final: BackfillStatus | null) => {
      if (final && Number(final.computed || 0) > 0) await reload().catch(() => {})
    }

    ;(async () => {
      let d: DfaRides
      try {
        d = await reload()
      } catch (e) {
        const status = (e as { status?: number }).status
        return setStatus({
          kind: "text",
          error: true,
          text: status ? `Failed to load DFA data (${status})` : "Network error loading DFA data",
        })
      }
      setStatus({ kind: "none" })
      if (!Number(d.n_total || (d.rides ?? []).length || 0)) {
        // Nothing indexed yet: if intervals.icu is still syncing, wait for it and load again.
        try {
          let p = await syncProgress()
          if (p?.state === "running") {
            for (let i = 0; i < 150 && stillHere() && p?.state === "running"; i++) {
              setStatus({ kind: "sync", progress: p })
              await sleep(2000)
              p = await syncProgress().catch(() => ({ state: "done" }) as SyncProgress)
            }
            if (stillHere()) {
              setStatus({ kind: "none" })
              await reload().catch(() => {})
            }
            return
          }
        } catch {
          /* no sync endpoint answer: fall through */
        }
      }
      const stale = Number(d.n_stale_version || 0)
      if (stale > 0) {
        let throttled = false
        try {
          throttled = Date.now() - Number(localStorage.getItem(lsKey(MIGRATE_KEY)) || 0) < MIGRATE_THROTTLE_MS
        } catch {
          /* ignore */
        }
        if (throttled) {
          return setStatus({ kind: "text", text: `${stale} ride(s) pending DFA upgrade — will retry shortly.` })
        }
        try {
          const j = await startBackfill(true)
          try {
            localStorage.setItem(lsKey(MIGRATE_KEY), String(Date.now()))
          } catch {
            /* ignore */
          }
          if (j.task_id) {
            setStatus({ kind: "text", text: `Upgrading ${stale} ride(s) to the corrected DFA algorithm…` })
            await pollBackfill(j.task_id)
            await reload().catch(() => {})
          }
        } catch {
          /* leave the data as loaded */
        }
        if (stillHere()) setStatus({ kind: "none" })
        return
      }
      try {
        const j = await startBackfill()
        try {
          localStorage.setItem(lsKey(BACKFILL_KEY), String(Date.now()))
        } catch {
          /* ignore */
        }
        if (!j.task_id) return
        const final = await pollBackfill(j.task_id)
        await refreshAfter(final)
        await sleep(2500)
        if (stillHere()) setStatus({ kind: "none" })
      } catch {
        /* backfill unavailable */
      }
    })()
    return () => {
      alive.current = false
    }
  }, [reload, lsKey])

  const cancel = (taskId?: string) => taskId && cancelBackfill(taskId).catch(() => {})

  return (
    <div className="grid gap-3">
      <Card>
        <CardContent className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">
                DFA α1 — HRV fractal analysis{" "}
                <span className="rounded border border-yellow-500 bg-yellow-500/15 px-1.5 text-[10px] align-middle text-yellow-600">
                  beta
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                HR-variability thresholds + intensity distribution from beat-to-beat RR data.
              </p>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant={view === "aggregate" ? "default" : "outline"} onClick={() => setView("aggregate")}>
                Aggregate
              </Button>
              <Button size="sm" variant={view === "perride" ? "default" : "outline"} onClick={() => setView("perride")}>
                Per-ride
              </Button>
            </div>
          </div>
          <StatusLine status={status} onCancel={cancel} />
        </CardContent>
      </Card>
      {data === null ? (
        <p className="p-12 text-center text-sm text-muted-foreground">Loading DFA α1 analysis…</p>
      ) : view === "aggregate" ? (
        <Aggregate data={data} />
      ) : (
        <PerRide rides={data.rides ?? []} />
      )}
    </div>
  )
}

function StatusLine({ status, onCancel }: { status: Status; onCancel: (taskId?: string) => void }) {
  if (status.kind === "none") return null
  if (status.kind === "text") {
    return <p role="status" className={`text-xs ${status.error ? "text-destructive" : "text-muted-foreground"}`}>{status.text}</p>
  }
  if (status.kind === "sync") {
    const { done = 0, total = 0 } = status.progress
    const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((100 * done) / total))) : 0
    return (
      <div role="status" className="text-xs">
        <div className="flex justify-between">
          <span>{total > 0 ? `Indexing rides from intervals.icu… ${done} of ${total}` : "Indexing rides from intervals.icu…"}</span>
          {total > 0 && <b>{pct}%</b>}
        </div>
        <Bar pct={total > 0 ? pct : 100} faded={total === 0} />
      </div>
    )
  }
  const s = status.status
  const state = String(s.state || "")
  const aug = Number(s.augmented || 0)
  const cand = Number(s.candidates || 0)
  const computed = Number(s.computed || 0)
  const terminal = isTerminal(state)
  if (terminal && cand === 0) return null
  let headline: string
  let pct = 0
  const indeterminate = state === "running" && cand === 0
  if (indeterminate) headline = "Indexing eligible rides…"
  else if (terminal) {
    pct = 100
    headline = computed > 0 ? `Updated ${computed} of ${cand} ride${cand === 1 ? "" : "s"}` : "No new HRV rides to update"
  } else if (aug === 0) headline = `${cand} ride${cand === 1 ? "" : "s"} eligible`
  else {
    pct = cand > 0 ? Math.round((100 * aug) / cand) : 0
    headline = `Updating ${aug} of ${cand} ride${cand === 1 ? "" : "s"} (${pct}%)`
  }
  return (
    <div role="status" className="text-xs">
      <div className="flex items-center justify-between gap-2">
        <span>{headline}</span>
        {state === "running" && (
          <Button size="xs" variant="outline" title="Stop DFA backfill" onClick={() => onCancel(s.task_id)}>
            Cancel
          </Button>
        )}
      </div>
      <Bar pct={indeterminate ? 100 : pct} faded={indeterminate} />
      {(aug > 0 || terminal) && (
        <p className="mt-1 text-muted-foreground">
          {computed} computed · {Number(s.no_rr_data || 0)} no-HRV · {Number(s.failed || 0)} failed
          {s.current ? ` · ${s.current}` : ""}
        </p>
      )}
    </div>
  )
}

const Bar = ({ pct, faded }: { pct: number; faded?: boolean }) => (
  <div className="mt-1.5 h-2 overflow-hidden rounded bg-muted">
    <div className={`h-full rounded bg-primary transition-[width] ${faded ? "opacity-40" : ""}`} style={{ width: `${pct}%` }} />
  </div>
)

function InfoIcon() {
  return (
    <span
      tabIndex={0}
      role="button"
      aria-label="What is r²?"
      title={R2_TOOLTIP}
      className="inline-flex size-3.5 cursor-help items-center justify-center rounded-full border text-[9px] text-muted-foreground"
    >
      i
    </span>
  )
}

function Aggregate({ data }: { data: DfaRides }) {
  const agg = data.aggregate ?? {}
  const t1 = agg.hrvt1
  const t2 = agg.hrvt2
  if (!t1 && !t2) {
    return (
      <Card>
        <CardContent className="text-sm leading-relaxed text-muted-foreground">
          <b className="text-foreground">No thresholds detected yet.</b> DFA threshold zones need a ride that{" "}
          <b className="text-foreground">sweeps through</b> the threshold — a progressive effort or a ramp where α1 falls
          past 0.75 (aerobic) / 0.50 (anaerobic). Steady endurance rides keep α1 above 0.75, so they never cross it.{" "}
          {Number(data.n_computed || 0)} ride(s) have α1 computed; do a progressive ride or a ramp test to unlock zone
          estimates.
        </CardContent>
      </Card>
    )
  }
  const dropped = Number(agg.n_excluded_decoupling || 0)
  return (
    <Card>
      <CardContent className="grid gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="font-semibold">Estimated thresholds &amp; zones</h3>
          <InfoIcon />
        </div>
        <p className="text-xs text-muted-foreground">
          Confidence-weighted (r²) median across recent threshold-crossing rides (r²≥{agg.agg_min_r2 ?? 0.5}); drifting /
          high-decoupling rides are excluded{dropped ? ` (${dropped} dropped)` : ""} because fatigue lowers α1 and biases the
          threshold. Power is the better-validated anchor in cycling.
        </p>
        <ThresholdRow label="Aerobic threshold (HRVT1)" alpha="0.75" sub="top of Zone 2 / easy ceiling" t={t1} />
        <ThresholdRow label="Anaerobic threshold (HRVT2)" alpha="0.50" sub="sustainable-hard ceiling" t={t2} />
        <ZoneModel t1={t1} t2={t2} />
      </CardContent>
    </Card>
  )
}

function ThresholdRow({ label, alpha, sub, t }: { label: string; alpha: string; sub: string; t?: Threshold | null }) {
  if (!t) return null
  const n = Math.max(Number(t.n_hr || 0), Number(t.n_power || 0))
  return (
    <div className="border-b py-2.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <b>{label}</b>
        <span className="text-xs text-muted-foreground">α1={alpha} · {sub}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          based on {n} ride{n === 1 ? "" : "s"}
          {t.date_span ? ` (${t.date_span[0]}…${t.date_span[1]})` : ""}
        </span>
      </div>
      <div className="mt-1 text-sm">
        HR{" "}
        {t.hr != null ? (
          <>
            <b className="text-green-500">{Math.round(t.hr)} bpm</b>{" "}
            <span className="text-[10px] text-muted-foreground">r²{(t.r2_hr_median || 0).toFixed(2)} · n{t.n_hr}</span>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {" · "}Power{" "}
        {t.power != null ? (
          <>
            <b className="text-green-500">{Math.round(t.power)} W</b>{" "}
            <span className="text-[10px] text-muted-foreground">r²{(t.r2_power_median || 0).toFixed(2)} · n{t.n_power}</span>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    </div>
  )
}

function ZoneModel({ t1, t2 }: { t1?: Threshold | null; t2?: Threshold | null }) {
  const p1 = t1?.power
  const p2 = t2?.power
  if (p1 == null && p2 == null) return null
  const w = (v?: number | null) => (v != null ? `${Math.round(v)} W` : "—")
  return (
    <div className="mt-2 text-xs">
      <p className="mb-1 text-muted-foreground">DFA power-zone model (3-zone, Gronwald 2022):</p>
      <table>
        <tbody>
          {p1 != null && (
            <tr><td className="px-2.5 py-0.5">Z1 Low (easy)</td><td className="px-2.5 py-0.5 text-right">&lt; {w(p1)}</td></tr>
          )}
          {p1 != null && p2 != null && (
            <tr><td className="px-2.5 py-0.5">Z2 Moderate</td><td className="px-2.5 py-0.5 text-right">{w(p1)} – {w(p2)}</td></tr>
          )}
          {p2 != null && (
            <tr><td className="px-2.5 py-0.5">Z3 High (hard)</td><td className="px-2.5 py-0.5 text-right">&gt; {w(p2)}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function ThresholdCells({ t, note }: { t?: Threshold | null; note?: string }) {
  if (!t) return <span className="text-muted-foreground">{note || "not detected"}</span>
  const cell = (load: number | null | undefined, unit: string, r2?: number | null) => {
    if (load == null) return <span className="text-muted-foreground">—</span>
    const q = r2Quality(r2)
    return (
      <>
        <span className={`font-semibold ${q.cls}`}>{Math.round(load)}{unit}</span>
        {r2 != null && <span className={`text-[10px] ${q.cls}`}> r²{r2.toFixed(2)} {q.label}</span>}
      </>
    )
  }
  return (
    <>
      HR {cell(t.hr, "", t.r2_hr)} · Power {cell(t.power, "W", t.r2_power)}
    </>
  )
}

function ZoneBar({ z }: { z?: DfaRide["zone_minutes"] }) {
  if (!z) return null
  const tot = Number(z.z1 || 0) + Number(z.z2 || 0) + Number(z.z3 || 0) || 1
  const pct = (v: number) => `${((100 * Number(v || 0)) / tot).toFixed(0)}%`
  return (
    <div
      className="flex h-2 w-30 overflow-hidden rounded"
      title={`Z1 ${z.z1}min / Z2 ${z.z2}min / Z3 ${z.z3}min (of ${tot.toFixed(0)}min analysed)`}
    >
      <div className="bg-green-500" style={{ width: pct(z.z1) }} />
      <div className="bg-yellow-500" style={{ width: pct(z.z2) }} />
      <div className="bg-red-500" style={{ width: pct(z.z3) }} />
    </div>
  )
}

function PerRide({ rides }: { rides: DfaRide[] }) {
  if (!rides.length) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">No rides with HRV data yet.</CardContent>
      </Card>
    )
  }
  const a1Class = (v?: number | null) => (v == null ? "" : v >= 0.75 ? "text-green-500" : v >= 0.5 ? "text-yellow-500" : "text-red-500")
  return (
    <Card>
      <CardContent className="grid gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="font-semibold">Per-ride DFA α1</h3>
          <InfoIcon />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-2">Date</th><th className="p-2">Ride</th>
                <th className="p-2 text-right">min</th><th className="p-2 text-right">avg HR</th>
                <th className="p-2 text-right">α1</th><th className="p-2">Z1·Z2·Z3</th>
                <th className="p-2">HRVT1 (aerobic)</th><th className="p-2">HRVT2 (anaerobic)</th>
              </tr>
            </thead>
            <tbody>
              {rides.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-2 whitespace-nowrap">{r.date}</td>
                  <td className="max-w-40 truncate p-2">{r.name || "Ride"}</td>
                  <td className="p-2 text-right">{r.duration_min ?? "—"}</td>
                  <td className="p-2 text-right">{r.avg_hr ?? "—"}</td>
                  <td className={`p-2 text-right font-semibold ${a1Class(r.alpha1_avg)}`}>
                    {r.alpha1_avg != null ? Number(r.alpha1_avg).toFixed(2) : "—"}
                  </td>
                  <td className="p-2"><ZoneBar z={r.zone_minutes} /></td>
                  <td className="p-2"><ThresholdCells t={r.hrvt1} note={r.hrvt1_note} /></td>
                  <td className="p-2"><ThresholdCells t={r.hrvt2} note={r.hrvt2_note} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] leading-snug text-muted-foreground">
          Zone bar = share of <i>analysed</i> time (valid α1 windows only, &lt; ride length). HRVT only resolves on rides that
          cross the threshold; steady rides show α1 + zones only.
        </p>
      </CardContent>
    </Card>
  )
}
