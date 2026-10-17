import { useState } from "react"

import { Button } from "@/components/ui/button"
import { addRace, isoDay } from "@/lib/home"

/** Add a B or C race to the existing plan. The server reshapes the weeks around it. */
export function PlanRace({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const today = isoDay()
  const [date, setDate] = useState("")
  const [name, setName] = useState("")
  const [priority, setPriority] = useState<"B" | "C">("B")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const why = !date ? "Pick the race date." : date < today ? "The race can't be in the past." : ""
  const submit = async () => {
    setBusy(true)
    setError("")
    try {
      await addRace({ date, name: name.trim(), priority })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <label className="flex flex-col gap-1">
        Race date
        <input type="date" className="rounded-md border px-2 py-1" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        Name
        <input className="rounded-md border px-2 py-1" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        Priority
        <select className="rounded-md border px-2 py-1" value={priority} onChange={(e) => setPriority(e.target.value as "B" | "C")}>
          <option value="B">B (taper a little)</option>
          <option value="C">C (train through)</option>
        </select>
      </label>
      <Button size="sm" disabled={busy || !!why} onClick={submit}>
        {busy ? "Saving…" : "Add race and reshape plan"}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
        Cancel
      </Button>
      {why && date !== "" && <p className="w-full text-muted-foreground">{why}</p>}
      {error && <p role="alert" className="w-full">Couldn’t add the race: {error}</p>}
    </div>
  )
}
