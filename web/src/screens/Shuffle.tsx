import { useCallback, useState } from "react"

import type { PickerResult } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { getPicker } from "@/lib/library"
import { WorkoutCard } from "@/screens/WorkoutCard"

type Load = { state: "idle" } | { state: "loading" } | { state: "ok"; data: PickerResult } | { state: "error"; message: string }

/** Five workouts for how you feel and how long you have. Press again for another set. */
export function Shuffle() {
  const [feel, setFeel] = useState(7)
  const [duration, setDuration] = useState(75)
  const [load, setLoad] = useState<Load>({ state: "idle" })

  const go = useCallback(() => {
    setLoad({ state: "loading" })
    getPicker(feel, duration).then(
      (data) => setLoad({ state: "ok", data }),
      (e: unknown) => setLoad({ state: "error", message: e instanceof Error ? e.message : String(e) }),
    )
  }, [feel, duration])

  const bad = !(duration >= 20 && duration <= 300)
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">Workout shuffle</h2>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <Label className="flex-col items-start gap-1">
              How do you feel? ({feel} of 10)
              <input type="range" min={1} max={10} value={feel} onChange={(e) => setFeel(Number(e.target.value))} />
            </Label>
            <Label className="flex-col items-start gap-1">
              Time available (min)
              <Input type="number" min={20} max={300} className="w-24" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </Label>
            <Button size="sm" disabled={bad || load.state === "loading"} onClick={go}>
              {load.state === "ok" ? "Shuffle again" : "Suggest workouts"}
            </Button>
          </div>
          {bad && <p className="text-sm">Time must be between 20 and 300 minutes.</p>}
        </CardContent>
      </Card>

      {load.state === "loading" && <p className="text-sm text-muted-foreground">Looking…</p>}
      {load.state === "error" && (
        <div role="alert" className="text-sm">
          <p>Couldn’t get suggestions: {load.message}</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={go}>
            Retry
          </Button>
        </div>
      )}
      {load.state === "ok" && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm">
              {load.data.readiness != null && <span className="font-medium">Readiness {Math.round(load.data.readiness)}/100. </span>}
              {load.data.advice}
              {load.data.baseline_used ? " No HRV data yet, so this uses a neutral baseline." : ""}
            </p>
            {load.data.workouts.length === 0 ? (
              <p className="text-sm">No workouts fit. Try a longer time.</p>
            ) : (
              <ul className="divide-y">
                {load.data.workouts.map((w) => (
                  <WorkoutCard key={`${w.Category}/${w.File}`} w={w} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
