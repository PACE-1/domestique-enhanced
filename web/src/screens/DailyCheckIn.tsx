import { useState } from "react"

import type { DailyLogRead } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { getDailyLog, hooperToRate, rateToHooper, saveDailyLog, type DailyLogInput } from "@/lib/home"
import { Panel, useLoad } from "@/screens/panel"

// The rider rates 1 (worst) to 5 (best); lib/home converts to the server's Hooper scale on save.
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
      await saveDailyLog({
        sleep_quality: rateToHooper(v.sleep_quality),
        fatigue: rateToHooper(v.fatigue),
        stress: rateToHooper(v.stress),
        soreness: rateToHooper(v.soreness),
        mood: rateToHooper(v.mood),
      })
      done()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted-foreground">
        Rate each from 1 (worst) to 5 (best): 5 is slept well, fresh, calm, no soreness and a good mood.
      </p>
      {FIELDS.map(([key, label]) => (
        <Label key={key} className="flex items-center justify-between gap-4">
          {label}
          <NativeSelect
            
            value={v[key]}
            onChange={(e) => setV({ ...v, [key]: Number(e.target.value) })}
          >
            {[1, 2, 3, 4, 5].map((n) => (
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

/** Average of the four Hooper ratings as a 1 (worst) to 5 (best) score, or a dash when the day has none. */
function wellness(t: { sleep_quality?: number | null; fatigue?: number | null; stress?: number | null; soreness?: number | null }) {
  const rates = [t.sleep_quality, t.fatigue, t.stress, t.soreness].filter((x): x is number => typeof x === "number").map(hooperToRate)
  return rates.length ? `${(rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(1)} / 5` : "—"
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
                sleep_quality: hooperToRate(t?.sleep_quality ?? 4),
                fatigue: hooperToRate(t?.fatigue ?? 4),
                stress: hooperToRate(t?.stress ?? 4),
                soreness: hooperToRate(t?.soreness ?? 4),
                mood: hooperToRate(t?.mood ?? 4),
              }}
              done={() => { setEditing(false); retry() }}
            />
          )
        return (
          <div className="space-y-2 text-sm">
            <p>
              Logged today · wellness {wellness(t)}
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
