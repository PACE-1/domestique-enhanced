import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Input } from "@/components/ui/input"
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
      <Label className="flex-col items-start gap-1">
        Race date
        <Input type="date"  min={today} value={date} onChange={(e) => setDate(e.target.value)} />
      </Label>
      <Label className="flex-col items-start gap-1">
        Name
        <Input  value={name} onChange={(e) => setName(e.target.value)} />
      </Label>
      <Label className="flex-col items-start gap-1">
        Priority
        <NativeSelect  value={priority} onChange={(e) => setPriority(e.target.value as "B" | "C")}>
          <option value="B">B (taper a little)</option>
          <option value="C">C (train through)</option>
        </NativeSelect>
      </Label>
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
