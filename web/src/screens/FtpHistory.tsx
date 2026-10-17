import { useState } from "react"

import type { FtpHistory as History } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateFtp } from "@/lib/rides"
import { getFtpHistory } from "@/lib/wellness"
import { LineChart } from "@/screens/Chart"
import { Panel, useLoad } from "@/screens/panel"

const SOURCE: Record<string, string> = {
  tested_ramp: "ramp test",
  tested_coggan_20min: "20-minute test",
  tested_sixty_min: "60-minute test",
  tested_cp_test: "CP test",
  eftp_auto: "automatic from eFTP",
  eftp_icu: "eFTP from intervals.icu",
  eftp_local: "eFTP from your rides",
  manual: "typed in",
}

/** Every FTP you applied or declined, with the way you got it. A new value can be typed in here. */
export function FtpHistory() {
  const [load, retry, refresh] = useLoad<History>(getFtpHistory)
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const [error, setError] = useState("")
  const bad = value !== "" && !(Number(value) >= 50 && Number(value) <= 600)
  const set = async () => {
    setBusy(true)
    setError("")
    setMsg("")
    try {
      const r = await updateFtp(Math.round(Number(value)), "manual", "manual", true)
      setMsg(`FTP is now ${Math.round(r.ftp)} W.`)
      setValue("")
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel title="FTP history" load={load} retry={retry}>
      {(h) => {
        const applied = h.history.filter((e) => e.applied && e.ftp != null)
        return (
          <div className="space-y-3 text-sm">
            <p>
              Current FTP <span className="font-medium">{Math.round(h.ftp_current)} W</span> ({SOURCE[h.ftp_source ?? "manual"] ?? h.ftp_source}).
            </p>
            {applied.length >= 2 && (
              <LineChart series={[{ name: "FTP", color: "var(--chart-2)", points: applied.map((e, i) => ({ x: i, y: e.ftp as number })) }]} unit="W" summary={`FTP over ${applied.length} changes, now ${Math.round(h.ftp_current)} W`} />
            )}
            {h.history.length === 0 ? (
              <p className="text-muted-foreground">No changes recorded yet.</p>
            ) : (
              <ul className="divide-y">
                {[...h.history].reverse().map((e, i) => (
                  <li key={i} className="flex justify-between gap-2 py-1">
                    <span>
                      {e.date?.slice(0, 10) ?? "—"} · {e.ftp != null ? `${Math.round(e.ftp)} W` : "—"}
                    </span>
                    <span className="text-muted-foreground">
                      {SOURCE[e.type] ?? e.type}
                      {e.applied ? "" : " (not applied)"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <Label className="flex-col items-start gap-1">
                Set FTP (W)
                <Input type="number" min={50} max={600} className="w-28" value={value} onChange={(e) => setValue(e.target.value)} />
              </Label>
              <Button size="sm" disabled={busy || value === "" || bad} onClick={set}>
                Set FTP
              </Button>
            </div>
            {bad && <p>FTP must be between 50 and 600 W.</p>}
            {msg && <p role="status">{msg}</p>}
            {error && <p role="alert">Couldn’t set FTP: {error}</p>}
          </div>
        )
      }}
    </Panel>
  )
}
