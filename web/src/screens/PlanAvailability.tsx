import { useState } from "react"

import { Button } from "@/components/ui/button"
import { saveAvailability, type Availability } from "@/lib/home"

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric" })

/** Hours you can ride each day of the week. Blank leaves the day as planned; 0 means no riding. */
export function PlanAvailability({
  weekStart,
  today,
  stored,
  onDone,
  onCancel,
}: {
  weekStart: string
  today: string
  stored: Availability
  onDone: () => void
  onCancel: () => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((d) => d >= today)
  const [hours, setHours] = useState<Record<string, string>>(() =>
    Object.fromEntries(days.map((d) => [d, stored[d] ? String(stored[d].hours) : ""])),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const bad = days.some((d) => hours[d] !== "" && !(Number(hours[d]) >= 0 && Number(hours[d]) <= 12))
  const submit = async () => {
    setBusy(true)
    setError("")
    try {
      // The server replaces the whole map, so keep every other week's entries.
      const next: Availability = { ...stored }
      for (const d of days) {
        if (hours[d] === "") delete next[d]
        else next[d] = { hours: Number(hours[d]), type: Number(hours[d]) > 0 ? "available" : "holiday" }
      }
      await saveAvailability(next)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted-foreground">Hours you can ride. Leave blank to keep the day as planned; 0 means no riding.</p>
      <div className="flex flex-wrap gap-2">
        {days.map((d) => (
          <label key={d} className="flex flex-col gap-1">
            {dayLabel(d)}
            <input
              type="number"
              min={0}
              max={12}
              step={0.5}
              className="w-20 rounded-md border px-2 py-1"
              aria-label={`Hours ${dayLabel(d)}`}
              value={hours[d]}
              onChange={(e) => setHours({ ...hours, [d]: e.target.value })}
            />
          </label>
        ))}
      </div>
      {days.length === 0 && <p>This week is over.</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || bad || days.length === 0} onClick={submit}>
          Save availability
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {bad && <p>Hours must be between 0 and 12.</p>}
      {error && <p role="alert">Couldn’t save: {error}</p>}
    </div>
  )
}
