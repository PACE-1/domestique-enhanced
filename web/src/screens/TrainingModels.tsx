import { useCallback, useState } from "react"

import type { BanisterValidation, FatigueResistance, TauFits } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getBanister, getFatigue, getTauFits } from "@/lib/analysis"
import { Panel, Row, useLoad } from "@/screens/panel"

const f1 = (v: unknown) => (typeof v === "number" ? v.toFixed(1) : "—")
const range = (lo: unknown, hi: unknown) => (typeof lo === "number" && typeof hi === "number" ? `${f1(lo)}–${f1(hi)}` : "—")

/** The time constants (days) the app fitted to your own history, against the textbook ones. */
export function TauFitsCard() {
  const [load, retry] = useLoad<TauFits>(getTauFits)
  return (
    <Panel title="Your training-load time constants" load={load} retry={retry}>
      {(d) => {
        const c = (d.conventional ?? {}) as Record<string, number>
        if (d.fit_status === "insufficient_data")
          return (
            <p className="text-sm">
              Not enough data for a personal fit yet. It needs about 5 weighted markers (a race-tagged ride counts 1, an FTP test 0.8, an
              FTP step of 3 W or more 0.5). You have {(d.weighted_n ?? 0).toFixed(1)} from {d.n_markers ?? 0} FTP estimates. The plan uses
              the usual 42 days for fitness and 7 days for fatigue.
            </p>
          )
        return (
          <div className="space-y-2 text-sm">
            <p>
              {d.fit_status === "success" ? "Fit accepted." : "Fit rejected: too uncertain. The plan uses the usual values."} {d.n_markers ?? 0}{" "}
              FTP estimates, {(d.weighted_n ?? 0).toFixed(1)} weighted, r² {f1(d.fit_residual_r2)}.
            </p>
            <dl className="space-y-1">
              <Row label="Fitness (days): yours / usual" value={`${f1(d.ctl_tau_fit)} (${range(d.ctl_tau_ci_low, d.ctl_tau_ci_high)}) / ${f1(c.ctl_tau)}`} />
              <Row label="Fatigue (days): yours / usual" value={`${f1(d.atl_tau_fit)} (${range(d.atl_tau_ci_low, d.atl_tau_ci_high)}) / ${f1(c.atl_tau)}`} />
            </dl>
            <p className="text-muted-foreground">Tag your races on the ride page to improve this fit.</p>
          </div>
        )
      }}
    </Panel>
  )
}

const VERDICT: Record<string, string> = {
  better_than_literature: "Better than published models",
  in_line: "In line with published models (5 to 8% error)",
  worse_than_literature: "Worse than published models. A per-component override may help.",
}

/** How well the fitness model predicted your last four weeks of FTP. Slow to compute, so it runs on request. */
export function BanisterCard() {
  const [data, setData] = useState<BanisterValidation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const run = async (refresh: boolean) => {
    setBusy(true)
    setError("")
    try {
      setData(await getBanister(refresh))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const d = data
  return (
    <Card>
      <CardContent className="space-y-2 p-4 text-sm">
        <h2 className="text-sm font-semibold">How well the model predicts your FTP</h2>
        {d && d.fit_status === "insufficient_data" && (
          <p>
            Needs about 8 months of training with at least 2 markers in the last {d.holdout_weeks ?? 4} weeks. You have {d.n_markers_in_holdout ?? 0}.
            Tag races and log FTP tests to unlock it.
          </p>
        )}
        {d && d.fit_status !== "insufficient_data" && (
          <>
            <p className="font-medium">
              About {f1(d.ftp_mae_pct)}% error on FTP ({range(d.ftp_mae_pct_ci_low, d.ftp_mae_pct_ci_high)}%), or {f1(d.ftp_mae_w)} W.
            </p>
            <p>Fitness (CTL) error: {f1(d.ctl_mae_tss)} TSS ({range(d.ctl_mae_tss_ci_low, d.ctl_mae_tss_ci_high)}).</p>
            {d.comparison && VERDICT[d.comparison] && <p>{VERDICT[d.comparison]}.</p>}
            {d.fit_status === "low_confidence" && <p>The fit was rejected as too uncertain. The plan uses the usual time constants.</p>}
          </>
        )}
        {error && <p role="alert">Couldn’t check: {error}</p>}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(d !== null)}>
          {busy ? "Working…" : d ? "Recompute" : "Check the model"}
        </Button>
      </CardContent>
    </Card>
  )
}

const DURATION = (s: number) => (s >= 60 ? `${s / 60} min` : `${s} s`)

/** Peak power on tired legs against fresh legs. */
export function FatigueCard() {
  const [kj, setKj] = useState<1500 | 2000>(1500)
  const fetcher = useCallback(() => getFatigue(kj, false), [kj])
  const [load, retry] = useLoad<FatigueResistance>(fetcher)
  return (
    <Panel title="Fatigue resistance" load={load} retry={retry}>
      {(d: FatigueResistance) => {
        const n = d.n_long_rides ?? 0
        const why: Record<string, string> = {
          streams_not_hydrated_run_backfill: `${n} long rides found, but only ${d.n_long_rides_with_streams ?? 0} have power data stored. Read your ride history from the Power curve card.`,
          no_rides_in_window: "No rides in the last year yet.",
          no_fresh_tired_overlap: `${n} long rides, but none with both a hard fresh effort and a tired one to compare.`,
          compute_failed: "The calculation failed. Check the diagnostics.",
        }
        return (
          <div className="space-y-2 text-sm">
            <div className="flex gap-2" role="group" aria-label="Tired legs after">
              {([1500, 2000] as const).map((v) => (
                <Button key={v} size="sm" variant={kj === v ? "default" : "outline"} aria-pressed={kj === v} onClick={() => setKj(v)}>
                  After {v} kJ
                </Button>
              ))}
            </div>
            {d.fit_status === "insufficient_data" || n < 4 ? (
              <p>{(d.reason && why[d.reason]) || `Needs 4 long rides over ${kj} kJ. You have ${n} in the last year.`}</p>
            ) : (
              <>
                <p className="font-medium">
                  Robustness {f1(d.robustness_score)}% after {kj} kJ, from {n} rides. Top professionals reach 92 to 95%.
                </p>
                <table className="w-full text-left">
                  <thead className="text-muted-foreground">
                    <tr><th>Duration</th><th>Tired vs fresh</th><th>Efforts</th></tr>
                  </thead>
                  <tbody>
                    {d.by_duration.map((r, i) => {
                      const x = r as { duration_s?: number; fr_index_pct?: number; n_data_points?: number }
                      return (
                        <tr key={i}>
                          <td>{DURATION(x.duration_s ?? 0)}</td>
                          <td>{x.fr_index_pct != null ? `${x.fr_index_pct.toFixed(1)}%` : "—"}</td>
                          <td>{x.n_data_points ?? 0}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )
      }}
    </Panel>
  )
}
