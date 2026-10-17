import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { saveIcuKey, testIcuKey } from "@/lib/setup"

/** Connects intervals.icu with the rider's own athlete ID and API key (intervals.icu → Settings → Developer Settings). */
export function ApiKeyConnect({ open: forceOpen = false, prepare, onConnected }: { open?: boolean; prepare?: () => Promise<boolean>; onConnected: () => void }) {
  const [opened, setOpen] = useState(false)
  const open = opened || forceOpen
  const [athleteId, setAthleteId] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Connect with an API key
      </Button>
    )

  const connect = async () => {
    setBusy(true)
    setError("")
    try {
      if (prepare && !(await prepare())) throw new Error("Couldn’t create your profile. Reload the page and try again.")
      const t = await testIcuKey(athleteId, apiKey)
      if (!t.ok) throw new Error(t.error || "intervals.icu did not accept that key.")
      await saveIcuKey(t.athlete_id || athleteId, apiKey)
      setApiKey("")
      onConnected()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full space-y-2 rounded-xl border p-3 text-sm">
      <p className="text-muted-foreground">
        In intervals.icu open Settings → Developer Settings, create an API key and paste it here. The athlete ID is optional: it is found from the key.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Label className="flex-col items-start gap-1">
          Athlete ID (optional)
          <Input className="w-40" placeholder="i12345" value={athleteId} onChange={(e) => setAthleteId(e.target.value)} />
        </Label>
        <Label className="flex-col items-start gap-1">
          API key
          <Input className="w-64" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </Label>
        <Button size="sm" disabled={busy || !apiKey.trim()} onClick={connect}>
          {busy ? "Checking…" : "Connect"}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error && <p role="alert">Couldn’t connect: {error}</p>}
    </div>
  )
}
