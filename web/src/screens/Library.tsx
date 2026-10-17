import { useEffect, useState } from "react"

import type { WorkoutRow } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Input } from "@/components/ui/input"
import { listWorkouts, PAGE, SORTS, type WorkoutQuery } from "@/lib/library"
import { WorkoutCard } from "@/screens/WorkoutCard"

type Load = { state: "loading" } | { state: "ok"; rows: WorkoutRow[]; total: number | null } | { state: "error"; message: string }

const num = (v: string) => (v === "" ? null : Number(v))

export function Library() {
  const [q, setQ] = useState<WorkoutQuery>({ search: "", minDuration: null, maxDuration: null, sort: "score_desc" })
  const [applied, setApplied] = useState(q)
  const [load, setLoad] = useState<Load>({ state: "loading" })
  const [attempt, setAttempt] = useState(0)

  // Typing waits for a short pause before it asks the server.
  useEffect(() => {
    const t = setTimeout(() => setApplied(q), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    let live = true
    setLoad({ state: "loading" })
    listWorkouts(applied).then(
      (r) => live && setLoad({ state: "ok", ...r }),
      (e: unknown) => live && setLoad({ state: "error", message: e instanceof Error ? e.message : String(e) }),
    )
    return () => { live = false }
  }, [applied, attempt])

  const badRange = q.minDuration !== null && q.maxDuration !== null && q.minDuration > q.maxDuration

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">Workout library</h2>
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <Label className="flex-col items-start gap-1">
              Search
              <Input type="search"  placeholder="3x16, vo2, sweet spot…" value={q.search} onChange={(e) => setQ({ ...q, search: e.target.value })} />
            </Label>
            <Label className="flex-col items-start gap-1">
              From (min)
              <Input type="number" min={0} className="w-24" value={q.minDuration ?? ""} onChange={(e) => setQ({ ...q, minDuration: num(e.target.value) })} />
            </Label>
            <Label className="flex-col items-start gap-1">
              To (min)
              <Input type="number" min={0} className="w-24" value={q.maxDuration ?? ""} onChange={(e) => setQ({ ...q, maxDuration: num(e.target.value) })} />
            </Label>
            <Label className="flex-col items-start gap-1">
              Sort
              <NativeSelect  value={q.sort} onChange={(e) => setQ({ ...q, sort: e.target.value })}>
                {SORTS.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Label>
          </div>
          {badRange && <p className="text-sm">“From” is longer than “To”.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4">
          {load.state === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
          {load.state === "error" && (
            <div role="alert" className="text-sm">
              <p>Couldn’t load the library: {load.message}</p>
              <Button className="mt-2" size="sm" variant="outline" onClick={() => setAttempt(attempt + 1)}>
                Retry
              </Button>
            </div>
          )}
          {load.state === "ok" &&
            (load.rows.length === 0 ? (
              <p className="text-sm">No workouts match.</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  Showing {load.rows.length}
                  {load.total !== null ? ` of ${load.total}` : ""}
                  {load.rows.length >= PAGE ? ". Narrow the search to see others." : ""}
                </p>
                <ul className="divide-y">
                  {load.rows.map((w) => (
                    <WorkoutCard key={`${w.Category}/${w.File}`} w={w} />
                  ))}
                </ul>
              </>
            ))}
        </CardContent>
      </Card>
    </div>
  )
}
