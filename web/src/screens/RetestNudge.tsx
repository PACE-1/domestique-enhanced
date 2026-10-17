import { useState } from "react"

import { Button } from "@/components/ui/button"
import { swapSessionType } from "@/lib/home"
import { snoozeRetest } from "@/lib/wellness"

export interface Nudge {
  metric?: string
  reason?: string
  days_since?: number | null
  action?: string
  suggested_date?: string | null
  snooze_days?: number
}

/** "Your FTP (or LTHR) is out of date." Offers to put a test in the plan, or to ask again later. */
export function RetestNudge({ n }: { n: Nudge }) {
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState("")
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState("")
  const label = n.metric === "lthr" ? "LTHR" : "FTP"

  const run = async (work: () => Promise<string>) => {
    setBusy(true)
    setError("")
    try {
      setMsg(await work())
      setFinished(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2 rounded-xl border p-3 text-sm" role="note">
      <p>
        <span className="font-medium">Time to retest your {label}.</span> {n.reason}
        {n.days_since ? ` (${n.days_since} days)` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {n.action === "insert_ftp_test" && n.suggested_date && (
          <Button size="sm" disabled={busy || finished} onClick={() => run(async () => { await swapSessionType(n.suggested_date!, "ftp_test", 60); return `FTP test added on ${n.suggested_date}.` })}>
            Schedule a test on {n.suggested_date}
          </Button>
        )}
        {n.action === "lthr_instructions" && (
          <Button size="sm" variant="outline" onClick={() => setOpen(!open)} aria-expanded={open}>
            How to test LTHR
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy || finished} onClick={() => run(async () => { const r = await snoozeRetest(); return `Okay, I’ll ask again after ${r.until ?? `${n.snooze_days ?? 7} days`}.` })}>
          Snooze{n.snooze_days ? ` ${n.snooze_days} days` : ""}
        </Button>
      </div>
      {open && (
        <p className="text-muted-foreground">
          Warm up well, then ride 20 minutes as hard as you can hold steady on flat road. Your average heart rate over the last 15 minutes is a good estimate of LTHR. Enter it in Settings and your heart-rate zones update.
        </p>
      )}
      {msg && <p role="status">{msg}</p>}
      {error && <p role="alert">Couldn’t do that: {error}</p>}
    </div>
  )
}
