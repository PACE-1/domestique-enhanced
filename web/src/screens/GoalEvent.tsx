import type { EventProjection } from "@/api/types"
import { fmtMinutes } from "@/lib/home"
import { getProjection } from "@/lib/wellness"
import { Panel, Row, useLoad } from "@/screens/panel"

const days = (iso: string) => Math.round((new Date(`${iso}T12:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000)

/** The goal event and what the model predicts for it. Shows nothing when the plan has no event with a distance. */
export function GoalEvent() {
  const [load, retry] = useLoad<EventProjection>(getProjection)
  if (load.state === "ok" && !load.data.available) return null
  return (
    <Panel title="Goal event" load={load} retry={retry}>
      {(p) => {
        const left = p.event_date ? days(p.event_date) : null
        const hrs = p.predicted_finish_h ?? 0
        return (
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-medium">{p.event_name?.trim() || "Goal event"}</span>
              {p.event_date ? ` · ${p.event_date}` : ""}
              {left !== null ? ` · ${left > 1 ? `${left} days to go` : left === 1 ? "tomorrow" : left === 0 ? "today" : `${-left} days ago`}` : ""}
            </p>
            <p className="text-muted-foreground">
              {p.event_km} km · {p.event_climb_m} m climbing
            </p>
            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <Row label="Predicted finish" value={fmtMinutes(Math.round(hrs * 60))} />
              <Row label="Predicted power (NP)" value={p.predicted_np != null ? `${Math.round(p.predicted_np)} W` : "—"} />
              <Row label="Predicted load" value={p.predicted_tss != null ? `${Math.round(p.predicted_tss)} TSS` : "—"} />
              <Row label="Climbing readiness" value={p.climb_readiness_pct != null ? `${Math.round(p.climb_readiness_pct)}%` : "—"} />
              <Row label="Endurance gap" value={p.gap_endurance_h != null ? `${p.gap_endurance_h.toFixed(1)} h` : "—"} />
              <Row label="Longest ride needed" value={p.longest_required_h != null ? `${p.longest_required_h.toFixed(1)} h` : "—"} />
            </dl>
          </div>
        )
      }}
    </Panel>
  )
}
