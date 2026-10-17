import { useState } from "react"

import { Button } from "@/components/ui/button"
import { isoDay, markUnavailable, regeneratePlan, type TimeOffType } from "@/lib/home"

const TYPES: [TimeOffType, string][] = [
  ["holiday", "Holiday"],
  ["injury", "Injury"],
  ["illness", "Illness"],
]

/** Why the form can't be submitted, or "" when it can. */
export function problem(f: { start: string; end: string }, today: string): string {
  if (!f.start || !f.end) return "Pick the first and last day."
  if (f.start < today) return "The first day can't be in the past."
  if (f.end < f.start) return "The last day can't be before the first."
  return ""
}

export function PlanTimeOff({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const today = isoDay()
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [type, setType] = useState<TimeOffType>("holiday")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const why = problem({ start, end }, today)
  const submit = async () => {
    setBusy(true)
    setError("")
    try {
      await markUnavailable(start, end, type)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
      return
    }
    try {
      await regeneratePlan()
      onDone()
    } catch (e) {
      // The days off are saved; only the rebuild failed. Re-submitting would record them twice.
      setError(`Time off saved, but rebuilding the plan failed: ${e instanceof Error ? e.message : String(e)}. Reload the page to see the plan as it is.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <label className="flex flex-col gap-1">
        First day
        <input type="date" className="rounded-md border px-2 py-1" min={today} value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        Last day
        <input type="date" className="rounded-md border px-2 py-1" min={start || today} value={end} onChange={(e) => setEnd(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        Reason
        <select className="rounded-md border px-2 py-1" value={type} onChange={(e) => setType(e.target.value as TimeOffType)}>
          {TYPES.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <Button size="sm" disabled={busy || !!why} onClick={submit}>
        {busy ? "Saving…" : "Save and rebuild plan"}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
        Cancel
      </Button>
      {why && (start || end) && <p className="w-full text-muted-foreground">{why}</p>}
      {error && (
        <p role="alert" className="w-full">
          {error}
        </p>
      )}
    </div>
  )
}
