import { useState } from "react"

import type { IcuPushStatus } from "@/api/types"
import { Button } from "@/components/ui/button"
import { getPush, pushNow, setPushSync } from "@/lib/settings"
import { Panel, useLoad } from "@/screens/panel"

/** Copy the next 14 days of the plan to the intervals.icu calendar, once or continuously. */
export function CalendarPush() {
  const [load, retry, refresh] = useLoad<IcuPushStatus>(getPush)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const [error, setError] = useState("")
  const run = async (work: () => Promise<string>) => {
    setBusy(true)
    setError("")
    setMsg("")
    try {
      setMsg(await work())
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel title="Plan in the intervals.icu calendar" load={load} retry={retry}>
      {(p) => {
        if (!p.connected) return <p className="text-sm text-muted-foreground">Connect intervals.icu first.</p>
        const reconnect = !p.write_ok
        return (
          <div className="space-y-3 text-sm">
            <p>
              Keeping in sync is <span className="font-medium">{p.sync_enabled ? "on" : "off"}</span>. It covers the next {p.horizon_days} days.
            </p>
            {reconnect && <p>intervals.icu has not given this app permission to write to your calendar. Reconnect it to allow that.</p>}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy || reconnect}
                onClick={() =>
                  run(async () => {
                    const r = await setPushSync(!p.sync_enabled)
                    if (r.needs_reconnect) return "Reconnect intervals.icu to allow calendar writes."
                    return r.sync_enabled ? "Keeping your calendar in sync." : "Stopped. Workouts already on your calendar were removed."
                  })
                }
              >
                {p.sync_enabled ? "Turn off" : "Turn on"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || reconnect}
                onClick={() =>
                  run(async () => {
                    const r = await pushNow()
                    if (!r.ok) return r.needs_reconnect ? "Reconnect intervals.icu to allow calendar writes." : `Couldn’t push: ${r.error ?? "unknown error"}`
                    return `Pushed ${r.pushed ?? 0}, updated ${r.updated ?? 0}, removed ${r.deleted ?? 0}.`
                  })
                }
              >
                Push the plan now
              </Button>
            </div>
            {msg && <p role="status">{msg}</p>}
            {error && <p role="alert">Couldn’t do that: {error}</p>}
            <p className="text-xs text-muted-foreground">
              intervals.icu sends planned workouts on to every service you linked there. To stop them going to Zwift, open intervals.icu → Settings → Connections → Zwift and turn off workout upload.
            </p>
          </div>
        )
      }}
    </Panel>
  )
}
