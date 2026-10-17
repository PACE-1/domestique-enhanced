import { useCallback } from "react"

import type { WeekSummary as Week } from "@/api/types"
import { getWeekSummary } from "@/lib/home"
import { Panel, useLoad } from "@/screens/panel"

const n = (v: unknown) => (typeof v === "number" ? v : 0)

function Line({ label, done, planned, noPlan, flagOver }: { label: string; done: number; planned: number; noPlan: boolean; flagOver?: boolean }) {
  const over = !noPlan && flagOver && done > planned
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>
        <b>{Math.round(done)}</b> / {noPlan ? "—" : Math.round(planned)}
        {over && <span> (over plan)</span>}
      </span>
    </div>
  )
}

/** Done against planned for one ISO week. Last week also says when it was an overreach. */
function WeekCard({ offset, title }: { offset: number; title: string }) {
  const fetcher = useCallback(() => getWeekSummary(offset), [offset])
  const [load, retry] = useLoad<Week>(fetcher)
  return (
    <Panel title={title} load={load} retry={retry}>
      {(d) => {
        const noPlan = d.tss_target === null || d.tss_target === undefined
        if (noPlan && n(d.tss_done) === 0) return <p className="text-sm">Nothing planned or ridden this week.</p>
        const exp = d.exposure_minutes as Record<string, number>
        const plan = d.exposure_minutes_planned as Record<string, number>
        const high = n(exp.high_aerobic) + n(exp.anaerobic)
        const highP = n(plan.high_aerobic) + n(plan.anaerobic)
        const rides = Object.values(d.sports as Record<string, number>).reduce((a, b) => a + n(b), 0)
        const adherence = d.tss_adherence_pct
        return (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {d.week_start} to {d.week_end}
              {noPlan ? " · no plan on record" : ""} · {rides} {rides === 1 ? "activity" : "activities"}
            </p>
            <Line label="Load (TSS)" done={n(d.tss_done)} planned={n(d.tss_target)} noPlan={noPlan} flagOver />
            <Line label="Time (min)" done={n(d.duration_min_done)} planned={n(d.duration_min_planned)} noPlan={noPlan} />
            <Line label="Easy, zones 1 to 2 (min)" done={n(exp.low_aerobic)} planned={n(plan.low_aerobic)} noPlan={noPlan} />
            <Line label="Tempo, zone 3 (min)" done={n(exp.mid_aerobic)} planned={n(plan.mid_aerobic)} noPlan={noPlan} flagOver />
            <Line label="Hard, zones 4 and up (min)" done={high} planned={highP} noPlan={noPlan} flagOver />
            {d.overreach ? (
              <p role="status" className="text-sm">
                Overreach. {d.overreach_reasons.join("; ")}
                {d.overreach_reasons.length ? ". " : " "}Use “Apply tier-down” on the readiness card to ease today.
              </p>
            ) : adherence != null && adherence >= 70 && adherence <= 110 ? (
              <p className="text-sm">Load matched the plan ({Math.round(adherence)}%).</p>
            ) : null}
          </div>
        )
      }}
    </Panel>
  )
}

export const ThisWeek = () => <WeekCard offset={0} title="This week so far" />
export const LastWeek = () => <WeekCard offset={-1} title="Last week" />
