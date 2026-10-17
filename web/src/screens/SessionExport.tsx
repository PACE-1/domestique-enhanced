import { useState } from "react"

import { Button, buttonVariants } from "@/components/ui/button"
import { fitWorkoutUrl, pushWorkout, zwoUrl } from "@/lib/plan"

/** Take a session out of the app: the .zwo or .fit file, or onto the intervals.icu calendar. */
export function SessionExport({ file, day, name, type, minutes }: { file: string; day: string; name: string; type: string; minutes: number }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const push = async () => {
    setBusy(true)
    setMsg("")
    try {
      const r = await pushWorkout(file, day)
      if (r.needs_reconnect) setMsg("Reconnect intervals.icu in Settings to allow calendar writes.")
      else if (r.needs_lthr) setMsg("Set your LTHR in Settings first: this workout is in heart-rate mode.")
      else if (r.error) setMsg(`Couldn’t add it: ${r.error.replace(/_/g, " ")}.`)
      else setMsg("Added to your intervals.icu calendar.")
    } catch (e) {
      setMsg(`Couldn’t add it: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }
  const link = buttonVariants({ size: "sm", variant: "ghost" })
  return (
    <span className="flex flex-wrap items-center gap-1">
      <a className={link} href={zwoUrl(file)} download aria-label={`Download .zwo for ${day}`}>
        .zwo
      </a>
      <a className={link} href={fitWorkoutUrl(file, name, type, minutes)} download aria-label={`Download .fit for ${day}`}>
        .fit
      </a>
      <Button size="sm" variant="ghost" disabled={busy} aria-label={`Add ${day} to intervals.icu`} onClick={push}>
        To intervals.icu
      </Button>
      {msg && <span role="status" className="text-muted-foreground">{msg}</span>}
    </span>
  )
}
