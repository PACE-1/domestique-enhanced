import { useState } from "react"

import type { RedrawCandidate } from "@/api/types"
import { Button } from "@/components/ui/button"
import { acceptRedraw, fmtMinutes, previewRedraw } from "@/lib/home"

/** Offer another workout for one day: look, ask for a different one, or keep it. */
export function PlanRedraw({ day, onDone, onCancel }: { day: string; onDone: () => void; onCancel: () => void }) {
  const [candidate, setCandidate] = useState<RedrawCandidate | null>(null)
  const [seen, setSeen] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const look = async (exclude: string[]) => {
    setBusy(true)
    setError("")
    try {
      const c = await previewRedraw(day, exclude)
      if (!c.ok) setError(c.action === "no_candidate" ? "No other workout fits this day." : (c.reason ?? "Can't pick a workout for this day."))
      else {
        setCandidate(c)
        if (c.zwo_name) setSeen([...exclude, c.zwo_name])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const accept = async () => {
    if (!candidate) return
    setBusy(true)
    setError("")
    try {
      await acceptRedraw(candidate)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {!candidate ? (
        <Button size="sm" disabled={busy} onClick={() => look(seen)}>
          Find another workout
        </Button>
      ) : (
        <>
          <span>
            {candidate.zwo_name} · {fmtMinutes(candidate.duration_min ?? 0)} · {Math.round(candidate.tss_estimate ?? 0)} TSS
            {candidate.exhausted ? " (you've seen them all)" : ""}
          </span>
          <Button size="sm" disabled={busy} onClick={accept}>
            Use this
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => look(seen)}>
            Another
          </Button>
        </>
      )}
      <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
        Cancel
      </Button>
      {error && <span role="alert">{error}</span>}
    </span>
  )
}
