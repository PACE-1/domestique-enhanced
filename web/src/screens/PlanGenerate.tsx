import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { generatePlan, isoDay, type GenerateRequest } from "@/lib/home"
import { advancedProblem, applyAdvanced, GOALS, NO_ADVANCED, type Advanced } from "@/lib/planForm"
import { PlanAdvanced } from "@/screens/PlanAdvanced"

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

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
  const [adv, setAdv] = useState<Advanced>(NO_ADVANCED)
  const [advOpen, setAdvOpen] = useState(false)
  const [recommended, setRecommended] = useState<Record<string, number> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const why = problem({ hours, weeks, goal, eventDate }, today) || advancedProblem(adv, goal, today)
  const submit = async () => {
    setBusy(true)
    setError("")
    try {
      const base: GenerateRequest = {
        goal,
        hours_per_week: hours,
        plan_weeks: weeks,
        rest_days: rest,
        ...(goal === "event" ? { event_name: eventName, event_date: eventDate } : {}),
      }
      await generatePlan(applyAdvanced(base, adv, recommended))
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
          <Label className="text-sm">
            Goal
            <NativeSelect className="mt-1 block w-full" value={goal} onChange={(e) => setGoal(e.target.value as GenerateRequest["goal"])}>
              {GOALS.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Label>
          <Label className="text-sm">
            Hours per week
            <Input type="number" className="mt-1 block w-full" min={1} max={40} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
          </Label>
          <Label className="text-sm">
            Plan length (weeks)
            <Input type="number" className="mt-1 block w-full" min={4} max={52} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} />
          </Label>
          {goal === "event" && (
            <>
              <Label className="text-sm">
                Event name
                <Input className="mt-1 block w-full" value={eventName} onChange={(e) => setEventName(e.target.value)} />
              </Label>
              <Label className="text-sm">
                Event date
                <Input type="date" className="mt-1 block w-full" min={today} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              </Label>
            </>
          )}
        </div>
        <fieldset className="text-sm">
          <legend className="mb-1">Rest days</legend>
          <div className="flex flex-wrap gap-3">
            {DAYS.map((d, i) => (
              <Label key={d} className="flex items-center gap-1">
                <Checkbox
                  checked={rest.includes(i)}
                  onCheckedChange={(on) => setRest(on ? [...rest, i].sort() : rest.filter((x) => x !== i))}
                />
                {d}
              </Label>
            ))}
          </div>
        </fieldset>
        <Button size="sm" variant="ghost" aria-expanded={advOpen} onClick={() => setAdvOpen(!advOpen)}>
          {advOpen ? "Hide more options" : "More options…"}
        </Button>
        {advOpen && <PlanAdvanced a={adv} set={setAdv} goal={goal} base={{ plan_weeks: weeks, hours_per_week: hours, event_date: eventDate }} today={today} onRecommended={setRecommended} />}
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
