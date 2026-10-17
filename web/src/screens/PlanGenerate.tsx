import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { generatePlan, isoDay, type GenerateRequest } from "@/lib/home"

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const GOALS: [GenerateRequest["goal"], string][] = [
  ["general", "General fitness"],
  ["ftp", "Raise FTP"],
  ["event", "Prepare for an event"],
]

/** Why the form can't be submitted, or "" when it can. */
export function problem(f: { hours: number; weeks: number; goal: string; eventDate: string }, today: string): string {
  if (!(f.hours >= 1 && f.hours <= 40)) return "Hours per week must be between 1 and 40."
  if (!(f.weeks >= 4 && f.weeks <= 52)) return "Plan length must be between 4 and 52 weeks."
  if (f.goal === "event" && !f.eventDate) return "Pick the event date."
  if (f.goal === "event" && f.eventDate <= today) return "The event date must be in the future."
  return ""
}

export function PlanGenerate({ hasPlan, onDone }: { hasPlan: boolean; onDone: () => void }) {
  const today = isoDay()
  const [goal, setGoal] = useState<GenerateRequest["goal"]>("general")
  const [hours, setHours] = useState(8)
  const [weeks, setWeeks] = useState(12)
  const [rest, setRest] = useState<number[]>([0])
  const [eventName, setEventName] = useState("")
  const [eventDate, setEventDate] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const why = problem({ hours, weeks, goal, eventDate }, today)
  const submit = async () => {
    setBusy(true)
    setError("")
    try {
      await generatePlan({
        goal,
        hours_per_week: hours,
        plan_weeks: weeks,
        rest_days: rest,
        ...(goal === "event" ? { event_name: eventName, event_date: eventDate } : {}),
      })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">{hasPlan ? "Replace the plan" : "Create a plan"}</h2>
        {hasPlan && <p className="text-sm text-muted-foreground">This replaces the current plan, including sessions you moved or changed.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Goal
            <select className="mt-1 block w-full rounded-md border px-2 py-1" value={goal} onChange={(e) => setGoal(e.target.value as GenerateRequest["goal"])}>
              {GOALS.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Hours per week
            <input type="number" className="mt-1 block w-full rounded-md border px-2 py-1" min={1} max={40} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
          </label>
          <label className="text-sm">
            Plan length (weeks)
            <input type="number" className="mt-1 block w-full rounded-md border px-2 py-1" min={4} max={52} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} />
          </label>
          {goal === "event" && (
            <>
              <label className="text-sm">
                Event name
                <input className="mt-1 block w-full rounded-md border px-2 py-1" value={eventName} onChange={(e) => setEventName(e.target.value)} />
              </label>
              <label className="text-sm">
                Event date
                <input type="date" className="mt-1 block w-full rounded-md border px-2 py-1" min={today} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              </label>
            </>
          )}
        </div>
        <fieldset className="text-sm">
          <legend className="mb-1">Rest days</legend>
          <div className="flex flex-wrap gap-3">
            {DAYS.map((d, i) => (
              <label key={d} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={rest.includes(i)}
                  onChange={(e) => setRest(e.target.checked ? [...rest, i].sort() : rest.filter((x) => x !== i))}
                />
                {d}
              </label>
            ))}
          </div>
        </fieldset>
        {why && <p className="text-sm text-muted-foreground">{why}</p>}
        {error && (
          <p role="alert" className="text-sm">
            Couldn’t build the plan: {error}
          </p>
        )}
        <Button disabled={busy || !!why} onClick={submit}>
          {busy ? "Building…" : hasPlan ? "Replace plan" : "Create plan"}
        </Button>
      </CardContent>
    </Card>
  )
}
