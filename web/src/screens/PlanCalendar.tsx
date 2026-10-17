import { useCallback, useState } from "react"

import type { CalendarDay, CalendarRead, CalendarWeek } from "@/api/types"
import { Button } from "@/components/ui/button"
import { fmtMinutes, isoDay, moveSession } from "@/lib/home"
import { getCalendar } from "@/lib/plan"
import { rideRoute } from "@/lib/rides"
import { Panel, useLoad } from "@/screens/panel"

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const short = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })

const movable = (d: CalendarDay, today: string) =>
  !!d.planned && d.planned.session_type !== "rest" && !d.planned.is_race && !d.planned.status.startsWith("done") && d.date >= today

function Cell({ d, today, over, accepts, onDragStart, onDrop, setOver }: { d: CalendarDay; today: string; over: boolean; accepts: boolean; onDragStart: (date: string) => void; onDrop: (to: string) => void; setOver: (date: string | null) => void }) {
  const p = d.planned
  const rest = !p || p.session_type === "rest"
  const ride = d.actual as { ride_id?: string; tss?: number; name?: string } | null
  const canMove = movable(d, today)
  const label = `${short(d.date)}: ${rest ? "rest" : `${p!.display_name || p!.name}, ${fmtMinutes(Math.round(p!.duration_min))}, ${Math.round(p!.tss)} TSS${p!.status !== "pending" ? `, ${p!.status.replace(/_/g, " ")}` : ""}`}${ride ? `, rode ${Math.round(ride.tss ?? 0)} TSS` : ""}`
  return (
    <div
      role="group"
      aria-label={label}
      draggable={canMove}
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", d.date); e.dataTransfer.effectAllowed = "move"; onDragStart(d.date) }}
      onDragOver={(e) => { if (accepts) { e.preventDefault(); setOver(d.date) } }}
      onDragLeave={() => setOver(null)}
      onDrop={(e) => { e.preventDefault(); setOver(null); if (accepts) onDrop(d.date) }}
      className={`min-h-20 rounded-xl border p-1.5 text-xs ${d.is_today ? "border-primary" : ""} ${over ? "bg-accent" : ""} ${canMove ? "cursor-grab" : ""}`}
    >
      <div className="flex justify-between text-muted-foreground">
        <span>{short(d.date)}</span>
        {d.race && <span title="Race">🏁</span>}
      </div>
      {!rest && (
        <div className={p!.status === "dismissed" ? "line-through opacity-60" : ""}>
          <div className="truncate font-medium">{p!.display_name || p!.name}</div>
          <div className="text-muted-foreground">
            {fmtMinutes(Math.round(p!.duration_min))} · {Math.round(p!.tss)}
          </div>
        </div>
      )}
      {ride?.ride_id && (
        <a className="mt-0.5 block truncate underline" href={rideRoute(ride.ride_id)}>
          Rode {Math.round(ride.tss ?? 0)} TSS
        </a>
      )}
    </div>
  )
}

function Week({ w, today, drag, fromWeek, over, setOver, onDrop, onOpenWeek }: { w: CalendarWeek; today: string; drag: (d: string, week: string) => void; fromWeek: string | null; over: string | null; setOver: (d: string | null) => void; onDrop: (to: string) => void; onOpenWeek: (start: string) => void }) {
  return (
    <section aria-label={`Week of ${short(w.start_date)}`} className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className={w.is_current ? "font-medium" : ""}>
          {short(w.start_date)} to {short(w.end_date)}
          {w.phase ? ` · ${w.phase}` : ""}
          {w.is_stepback ? " · recovery" : ""}
        </span>
        <span className="flex items-center gap-2 text-muted-foreground">
          {Math.round(w.actual_tss ?? 0)} of {Math.round(w.planned_tss ?? 0)} TSS
          <Button size="sm" variant="ghost" onClick={() => onOpenWeek(w.start_date)}>
            Open week
          </Button>
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {w.days.map((d) => (
          <Cell key={d.date} d={d} today={today} over={over === d.date} accepts={fromWeek === w.start_date && d.date >= today} onDragStart={(date) => drag(date, w.start_date)} onDrop={onDrop} setOver={setOver} />
        ))}
      </div>
    </section>
  )
}

/** Plan against what was ridden, a week per row. Drag a planned session to another day to move it. */
export function PlanCalendar({ onOpenWeek, onChanged }: { onOpenWeek: (start: string) => void; onChanged: () => void }) {
  const fetcher = useCallback(() => getCalendar(), [])
  const [load, retry, refresh] = useLoad<CalendarRead>(fetcher)
  const [from, setFromDay] = useState<{ date: string; week: string } | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [msg, setMsg] = useState("")
  const [earlier, setEarlier] = useState(false)
  const today = isoDay()

  const move = async (to: string) => {
    if (!from || from.date === to) return
    setError("")
    setMsg("")
    try {
      const r = await moveSession(from.date, to)
      setMsg(r.swapped ? `Swapped ${short(from.date)} and ${short(to)}.` : `Moved ${short(from.date)} to ${short(to)}.`)
      refresh()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setFromDay(null)
    }
  }

  return (
    <Panel title="Calendar" load={load} retry={retry}>
      {(c) => {
        if (c.error) return <p role="alert" className="text-sm">The calendar could not be built ({c.error}). Check the plan file in Diagnostics.</p>
        const weeks = c.weeks
        const first = Math.max(0, weeks.findIndex((w) => w.is_current) - 2)
        const shown = earlier ? weeks : weeks.slice(first)
        if (!weeks.length) return <p className="text-sm text-muted-foreground">Nothing to show yet. Create a plan or import rides.</p>
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Drag a planned session to another day of the same week. If that day has a session, the two swap. Past days, races and other weeks stay put.</p>
            {msg && <p role="status" className="text-sm">{msg}</p>}
            {error && <p role="alert" className="text-sm">Couldn’t move that: {error}</p>}
            {!earlier && first > 0 && (
              <Button size="sm" variant="outline" onClick={() => setEarlier(true)}>
                Show {first} earlier week{first === 1 ? "" : "s"}
              </Button>
            )}
            <div className="hidden grid-cols-7 gap-1 text-center text-xs text-muted-foreground sm:grid">
              {DOW.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            {shown.map((w) => (
              <Week key={w.start_date} w={w} today={today} drag={(date, week) => setFromDay({ date, week })} fromWeek={from?.week ?? null} over={over} setOver={setOver} onDrop={move} onOpenWeek={onOpenWeek} />
            ))}
          </div>
        )
      }}
    </Panel>
  )
}
