import { useState } from "react"

import type { DailyLogRead } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { getDailyLog, saveDailyLog, type DailyLogInput } from "@/lib/home"
import { Panel, useLoad } from "@/screens/panel"

// 1 = best, 7 = worst, as the server's Hooper index expects.
const FIELDS = [
  ["sleep_quality", "Sleep"],
  ["fatigue", "Fatigue"],
  ["stress", "Stress"],
  ["soreness", "Soreness"],
  ["mood", "Mood"],
] as const

function Form({ initial, done }: { initial: DailyLogInput; done: () => void }) {
  const [v, setV] = useState<DailyLogInput>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const submit = async () => {
    setBusy(true)
    setError("")
    try {
      await saveDailyLog(v)
      done()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted-foreground">1 is best, 7 is worst.</p>
      {FIELDS.map(([key, label]) => (
        <Label key={key} className="flex items-center justify-between gap-4">
          {label}
          <NativeSelect
            
            value={v[key]}
            onChange={(e) => setV({ ...v, [key]: Number(e.target.value) })}
          >
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </NativeSelect>
        </Label>
      ))}
      <Button size="sm" disabled={busy} onClick={submit}>
        Save check-in
      </Button>
      {error && <p role="alert">Couldn’t save: {error}</p>}
    </div>
  )
}

export function DailyCheckIn() {
  const [log, retry] = useLoad<DailyLogRead>(getDailyLog)
  const [editing, setEditing] = useState(false)
  return (
    <Panel title="Daily check-in" load={log} retry={retry}>
      {(d) => {
        const t = d.today
        if (editing || !t)
          return (
            <Form
              initial={{
                sleep_quality: t?.sleep_quality ?? 4,
                fatigue: t?.fatigue ?? 4,
                stress: t?.stress ?? 4,
                soreness: t?.soreness ?? 4,
                mood: t?.mood ?? 4,
              }}
              done={() => { setEditing(false); retry() }}
            />
          )
        return (
          <div className="space-y-2 text-sm">
            <p>
              Logged today · Hooper index {t.hooper_index ?? "—"} (4 best, 28 worst)
            </p>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Change today’s check-in
            </Button>
          </div>
        )
      }}
    </Panel>
  )
}
