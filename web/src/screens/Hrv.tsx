import { useState } from "react"

import type { HrvPromptStatus } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { dismissHrvPrompt, getHrvPrompt, importHrvCsv, saveManualHrv } from "@/lib/wellness"
import { useLoad } from "@/screens/panel"

function Prompt({ s, done }: { s: HrvPromptStatus; done: () => void }) {
  const [error, setError] = useState("")
  const dismiss = async (level: "version" | "permanent") => {
    try {
      await dismissHrvPrompt(level)
      done()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  if (!s.should_show_prompt) return null
  return (
    <div className="space-y-2 rounded-xl border p-3 text-sm" role="note">
      <p>
        Your last ride{s.device_product_name ? ` on your ${s.device_product_name}` : ""} had no HRV data, so DFA α1 could not be worked out. Turn on HRV (R-R interval) recording on your device and the next ride will have it.
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => dismiss("version")}>
          Remind me after the next update
        </Button>
        <Button size="sm" variant="ghost" onClick={() => dismiss("permanent")}>
          Don’t show again
        </Button>
      </div>
      {error && <p role="alert">Couldn’t save that: {error}</p>}
    </div>
  )
}

/** Overnight HRV: type today’s rMSSD, or bring in an HRV4Training CSV. */
export function Hrv() {
  const [prompt, , refreshPrompt] = useLoad<HrvPromptStatus>(getHrvPrompt)
  const [value, setValue] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const [error, setError] = useState("")
  const bad = value !== "" && !(Number(value) > 0 && Number(value) <= 250)

  const run = async (work: () => Promise<string>) => {
    setBusy(true)
    setError("")
    setMsg("")
    try {
      setMsg(await work())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardContent className="space-y-3 p-4 text-sm">
        <h2 className="font-semibold">Heart-rate variability</h2>
          {prompt.state === "ok" && <Prompt s={prompt.data} done={refreshPrompt} />}
          <div className="flex flex-wrap items-end gap-2">
            <Label className="flex-col items-start gap-1">
              Today’s rMSSD (ms)
              <Input type="number" min={1} max={250} className="w-28" value={value} onChange={(e) => setValue(e.target.value)} />
            </Label>
            <Button size="sm" disabled={busy || value === "" || bad} onClick={() => run(async () => { const r = await saveManualHrv(Number(value)); setValue(""); return `Saved ${r.hrv_manual_rmssd} ms for ${r.date}.` })}>
              Save
            </Button>
          </div>
          {bad && <p>rMSSD must be above 0 and at most 250 ms.</p>}
          <div className="flex flex-wrap items-end gap-2">
            <Label className="flex-col items-start gap-1">
              HRV4Training CSV (date, rmssd)
              <Input type="file" accept=".csv,text/csv" className="w-64" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Label>
            <Button size="sm" variant="outline" disabled={busy || !file} onClick={() => run(async () => { const r = await importHrvCsv(file!); setFile(null); return `Imported ${r.imported} day${r.imported === 1 ? "" : "s"}${r.skipped ? `, skipped ${r.skipped} row${r.skipped === 1 ? "" : "s"} without a date or value` : ""}.` })}>
              Import CSV
            </Button>
          </div>
          {msg && <p role="status">{msg}</p>}
          {error && <p role="alert">Couldn’t do that: {error}</p>}
      </CardContent>
    </Card>
  )
}
