import { useCallback, useEffect, useState } from "react"

import type { PlanRead, PlanWeek } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PlanGenerate } from "@/screens/PlanGenerate"
import { currentWeek, dismissSession, fmtMinutes, getPlan, isoDay, moveSession, plannedTss, SWAP_TYPES, swapSessionType, weekSessions } from "@/lib/home"

type Load = { state: "loading" } | { state: "ok"; plan: PlanRead } | { state: "error"; message: string }

const STATUS_LABEL: Record<string, string> = {
  done: "done",
  done_partial: "done (partly)",
  missed: "missed",
  dismissed: "dismissed",
  ambiguous: "needs review",
}
const statusLabel = (status: string) =>
  status.startsWith("moved_from:") ? "moved" : (STATUS_LABEL[status] ?? "")

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })

export function Plan() {
  const [load, setLoad] = useState<Load>({ state: "loading" })
  const [index, setIndex] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState("")
  const [moving, setMoving] = useState<{ day: string; to: string } | null>(null)
  const [replacing, setReplacing] = useState(false)
  const [swapping, setSwapping] = useState<{ day: string; type: string; minutes: number } | null>(null)
  const today = isoDay()

  const run = useCallback(() => {
    setLoad({ state: "loading" })
    getPlan().then(
      (plan) => setLoad({ state: "ok", plan }),
      (e: unknown) => setLoad({ state: "error", message: e instanceof Error ? e.message : String(e) }),
    )
  }, [])
  useEffect(run, [run])

  // Dismiss or restore the day's session, then re-read the plan in place (no loading flash).
  const change = async (day: string, action: () => Promise<unknown>) => {
    setBusy(day)
    setActionError("")
    try {
      await action()
      const plan = await getPlan()
      setLoad({ state: "ok", plan })
      return true
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusy(null)
    }
  }
  const toggleDismissed = (day: string, undo: boolean) => change(day, () => dismissSession(day, undo))
  const confirmSwap = async () => {
    if (swapping && (await change(swapping.day, () => swapSessionType(swapping.day, swapping.type, swapping.minutes)))) setSwapping(null)
  }
  const confirmMove = async () => {
    if (moving && (await change(moving.day, () => moveSession(moving.day, moving.to)))) setMoving(null)
  }

  if (load.state === "loading") return <p className="text-sm text-muted-foreground">Loading…</p>
  if (load.state === "error")
    return (
      <div role="alert" className="text-sm">
        <p>Couldn’t load the plan: {load.message}</p>
        <Button className="mt-2" size="sm" variant="outline" onClick={run}>
          Retry
        </Button>
      </div>
    )

  const plan = load.plan.plan_json
  const weeks: PlanWeek[] = plan?.weeks ?? []
  if (!weeks.length)
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium">No training plan yet.</p>
        <PlanGenerate hasPlan={false} onDone={run} />
      </div>
    )

  const startAt = weeks.indexOf(currentWeek(plan, today) ?? weeks[0])
  const i = Math.min(Math.max(index ?? startAt, 0), weeks.length - 1)
  const week = weeks[i]
  const sessions = weekSessions(week)
  const goal = plan.goal

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-1 p-4">
          <h2 className="text-sm font-semibold">Plan</h2>
          <p className="text-sm text-muted-foreground">
            {goal?.event_name || goal?.type || "Training plan"}
            {goal?.hours_per_week ? ` · ${goal.hours_per_week} h/week` : ""} · {weeks.length} weeks
            {goal?.event_date ? ` · event ${goal.event_date}` : ""}
          </p>
          {!!plan.phases?.length && (
            <p className="text-sm text-muted-foreground">
              {plan.phases.map((p) => `${p.name} (${p.weeks} wk)`).join(" → ")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <Button size="sm" variant="outline" disabled={i === 0} onClick={() => setIndex(i - 1)}>
              Previous week
            </Button>
            <h2 className="text-sm font-semibold" aria-live="polite">
              Week {week.week_num} · {week.phase}
              {week.is_stepback ? " · recovery" : ""}
            </h2>
            <Button size="sm" variant="outline" disabled={i === weeks.length - 1} onClick={() => setIndex(i + 1)}>
              Next week
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {dayLabel(week.start)} to {dayLabel(week.end)} · {plannedTss(sessions)} of {Math.round(week.tss_target)} TSS planned
          </p>
          {sessions.length === 0 ? (
            <p className="text-sm">No sessions this week.</p>
          ) : (
            <ul className="divide-y">
              {sessions.map((s, k) => {
                const extra = statusLabel(s.status)
                const dismissed = s.status === "dismissed"
                const canToggle = !s.is_race && !s.status.startsWith("done")
                return (
                  <li key={k} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className={s.day === today ? "font-medium" : ""} aria-current={s.day === today ? "date" : undefined}>
                      {dayLabel(s.day)} · {s.zwo_name || s.session_type}
                    </span>
                    <span className="text-muted-foreground">
                      {fmtMinutes(s.duration_min)} · {Math.round(s.tss_estimate)} TSS{extra ? ` · ${extra}` : ""}
                    </span>
                    {canToggle && !dismissed && moving?.day !== s.day && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Move ${dayLabel(s.day)}`}
                        onClick={() => setMoving({ day: s.day, to: "" })}
                      >
                        Move
                      </Button>
                    )}
                    {canToggle && !dismissed && swapping?.day !== s.day && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Change type ${dayLabel(s.day)}`}
                        onClick={() => setSwapping({ day: s.day, type: s.session_type, minutes: s.duration_min })}
                      >
                        Change type
                      </Button>
                    )}
                    {swapping?.day === s.day && (
                      <span className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label="New type"
                          className="rounded-md border px-2 py-1 text-sm"
                          value={swapping.type}
                          onChange={(e) => setSwapping({ ...swapping, type: e.target.value })}
                        >
                          {SWAP_TYPES.map(([id, label]) => (
                            <option key={id} value={id}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          aria-label="Minutes"
                          className="w-20 rounded-md border px-2 py-1 text-sm"
                          min={30}
                          max={300}
                          value={swapping.minutes}
                          onChange={(e) => setSwapping({ ...swapping, minutes: Number(e.target.value) })}
                        />
                        <Button size="sm" disabled={busy === s.day || swapping.minutes < 30} onClick={confirmSwap}>
                          Apply
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setSwapping(null)}>
                          Cancel
                        </Button>
                      </span>
                    )}
                    {moving?.day === s.day && (
                      <span className="flex items-center gap-2">
                        <input
                          type="date"
                          aria-label="Move to"
                          className="rounded-md border px-2 py-1 text-sm"
                          min={today}
                          value={moving.to}
                          onChange={(e) => setMoving({ day: s.day, to: e.target.value })}
                        />
                        <Button size="sm" disabled={!moving.to || busy === s.day} onClick={confirmMove}>
                          Move here
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setMoving(null)}>
                          Cancel
                        </Button>
                      </span>
                    )}
                    {canToggle && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === s.day}
                        aria-label={`${dismissed ? "Restore" : "Dismiss"} ${dayLabel(s.day)}`}
                        onClick={() => toggleDismissed(s.day, dismissed)}
                      >
                        {dismissed ? "Restore" : "Dismiss"}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {actionError && (
            <p role="alert" className="text-sm">
              Couldn’t change that session: {actionError}
            </p>
          )}
        </CardContent>
      </Card>

      {replacing ? (
        <PlanGenerate hasPlan onDone={() => { setReplacing(false); setIndex(null); run() }} />
      ) : (
        <Button variant="outline" size="sm" onClick={() => setReplacing(true)}>
          Replace the plan…
        </Button>
      )}
    </div>
  )
}
