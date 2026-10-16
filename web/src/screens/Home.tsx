import { useCallback, useEffect, useState, type ReactNode } from "react"

import type { PlanRead, ProgrammeSummary, RiderStats } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  currentWeek,
  fmtMinutes,
  getPlan,
  getStats,
  getSummary,
  isoDay,
  plannedTss,
  reading,
  sessionsOn,
  weekSessions,
} from "@/lib/home"

type Load<T> = { state: "loading" } | { state: "ok"; data: T } | { state: "error"; message: string }

// One independent request per card: a failure in one leaves the others usable and is retried alone.
function useLoad<T>(fetcher: () => Promise<T>) {
  const [value, setValue] = useState<Load<T>>({ state: "loading" })
  const run = useCallback(() => {
    setValue({ state: "loading" })
    fetcher().then(
      (data) => setValue({ state: "ok", data }),
      (e: unknown) => setValue({ state: "error", message: e instanceof Error ? e.message : String(e) }),
    )
  }, [fetcher])
  useEffect(run, [run])
  return [value, run] as const
}

function Panel<T>({
  title,
  load,
  retry,
  children,
}: {
  title: string
  load: Load<T>
  retry: () => void
  children: (data: T) => ReactNode
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {load.state === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
        {load.state === "error" && (
          <div role="alert" className="text-sm">
            <p>Couldn’t load this: {load.message}</p>
            <Button className="mt-2" size="sm" variant="outline" onClick={retry}>
              Retry
            </Button>
          </div>
        )}
        {load.state === "ok" && children(load.data)}
      </CardContent>
    </Card>
  )
}

const Row = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="flex justify-between gap-4 text-sm">
    <dt className="text-muted-foreground">{label}</dt>
    <dd>{value}</dd>
  </div>
)

export function Home() {
  const [plan, retryPlan] = useLoad<PlanRead>(getPlan)
  const [stats, retryStats] = useLoad<RiderStats>(getStats)
  const [summary, retrySummary] = useLoad<ProgrammeSummary>(getSummary)
  const today = isoDay()

  return (
    <div className="grid gap-4 md:grid-cols-2" aria-label="Home">
      <Panel title="Today" load={plan} retry={retryPlan}>
        {(p) => {
          const week = currentWeek(p.plan_json, today)
          const todays = sessionsOn(week, today)
          if (!p.plan_json?.weeks?.length) return <p className="text-sm text-muted-foreground">No training plan yet. Create one in Training Plan.</p>
          if (!todays.length) return <p className="text-sm">Rest day. Nothing planned today.</p>
          return (
            <ul className="space-y-2">
              {todays.map((s, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium">{s.zwo_name || s.session_type}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {fmtMinutes(s.duration_min)} · {Math.round(s.tss_estimate)} TSS
                    {s.status && s.status !== "pending" ? ` · ${s.status.replace(/_/g, " ")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )
        }}
      </Panel>

      <Panel title="This week" load={plan} retry={retryPlan}>
        {(p) => {
          const week = currentWeek(p.plan_json, today)
          const sessions = weekSessions(week)
          if (!week) return <p className="text-sm text-muted-foreground">No plan week covers today.</p>
          return (
            <>
              <p className="text-sm text-muted-foreground">
                {week.phase || "Plan"}
                {week.is_stepback ? " · recovery week" : ""} · {plannedTss(sessions)} of {Math.round(week.tss_target)} TSS planned
              </p>
              <ul className="space-y-1">
                {sessions.map((s, i) => (
                  <li key={i} className="flex justify-between gap-4 text-sm">
                    <span aria-current={s.day === today ? "date" : undefined} className={s.day === today ? "font-medium" : ""}>
                      {s.day_name || s.day} · {s.session_type}
                    </span>
                    <span className="text-muted-foreground">{fmtMinutes(s.duration_min)}</span>
                  </li>
                ))}
              </ul>
            </>
          )
        }}
      </Panel>

      <Panel title="Fitness" load={stats} retry={retryStats}>
        {(s) => {
          const dash = (n: number | null, unit = "") => (n === null ? "—" : `${Math.round(n * 10) / 10}${unit}`)
          const power = s.power as Record<string, unknown> | null | undefined
          const load = s.load as Record<string, unknown> | null | undefined
          return (
            <dl className="space-y-1">
              <Row label="FTP" value={dash(reading(power?.ftp), " W")} />
              <Row label="W/kg" value={dash(reading(power?.w_per_kg))} />
              <Row label="CTL (fitness)" value={dash(reading(load?.ctl))} />
              <Row label="ATL (fatigue)" value={dash(reading(load?.atl))} />
              <Row label="TSB (form)" value={dash(reading(load?.tsb))} />
            </dl>
          )
        }}
      </Panel>

      <Panel title="Programme" load={summary} retry={retrySummary}>
        {(s) => (
          <dl className="space-y-1">
            <Row label="Weeks" value={s.weeks} />
            <Row label="Rides" value={s.rides} />
            <Row label="Hours" value={Number(s.totals?.hours ?? 0)} />
            <Row label="Distance" value={`${Number(s.totals?.km ?? 0)} km`} />
          </dl>
        )}
      </Panel>
    </div>
  )
}
