import { useState } from "react"

import { Button } from "@/components/ui/button"
import { rematchWeek } from "@/lib/home"

type Judged = { matches?: { session_date: string; session_type: string; current_status: string; new_status: string }[] }

/** Compare this week's sessions with the rides done. Shows what would change, then saves on confirm. */
export function PlanRematch({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [preview, setPreview] = useState<{ action?: string | null; lines: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const look = async () => {
    setBusy(true)
    setError("")
    try {
      const r = await rematchWeek(false)
      const changes = ((r as Judged).matches ?? []).filter((m) => m.new_status !== m.current_status)
      setPreview({ action: r.action, lines: changes.map((m) => `${m.session_date} ${m.session_type}: ${m.new_status.replace(/_/g, " ")}`) })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const apply = async () => {
    setBusy(true)
    setError("")
    try {
      await rematchWeek(true)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 text-sm">
      {!preview ? (
        <Button size="sm" disabled={busy} onClick={look}>
          {busy ? "Checking…" : "Check this week against my rides"}
        </Button>
      ) : preview.action === "no_current_week" ? (
        <p>No plan week covers today.</p>
      ) : (
        <>
          {preview.lines.length === 0 ? <p>Nothing would change.</p> : (
            <ul className="list-disc pl-5">
              {preview.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
          <Button size="sm" disabled={busy} onClick={apply}>
            Save these matches
          </Button>
        </>
      )}
      <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
        Close
      </Button>
      {error && <p role="alert">Couldn’t check: {error}</p>}
    </div>
  )
}
