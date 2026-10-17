import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { importFit, rideRoute, syncRides } from "@/lib/rides"

/** Bring rides in: a FIT file from a head unit or app, or a pull from intervals.icu. */
export function RideTools({ onChanged }: { onChanged: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState<"import" | "sync" | null>(null)
  const [msg, setMsg] = useState<{ text: string; ride?: string } | null>(null)
  const [error, setError] = useState("")

  const run = async (kind: "import" | "sync", work: () => Promise<{ text: string; ride?: string }>) => {
    setBusy(kind)
    setError("")
    setMsg(null)
    try {
      setMsg(await work())
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const doImport = () =>
    run("import", async () => {
      const r = await importFit(file!)
      const up = r.icu_upload as { ok?: boolean; skipped?: boolean; needs_reconnect?: boolean }
      const relay = up.ok ? " Sent to intervals.icu." : up.needs_reconnect ? " Not sent to intervals.icu: reconnect it in Settings." : ""
      setFile(null)
      return { text: `Ride imported.${relay}`, ride: r.ride_id.startsWith("fit_") ? r.ride_id : `fit_${r.ride_id}` }
    })
  const doSync = () =>
    run("sync", async () => {
      const r = await syncRides(true)
      if (r.skipped === "no_credentials") return { text: "intervals.icu is not connected. Connect it in Settings." }
      return { text: `${r.added} new ride${r.added === 1 ? "" : "s"} from intervals.icu (${r.total} stored).` }
    })

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-end gap-2">
        <Label className="flex-col items-start gap-1">
          FIT file
          <Input type="file" accept=".fit,.gz" className="w-64" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Label>
        <Button size="sm" disabled={!file || busy !== null} onClick={doImport}>
          {busy === "import" ? "Importing…" : "Import ride"}
        </Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={doSync}>
          {busy === "sync" ? "Syncing…" : "Sync from intervals.icu"}
        </Button>
      </div>
      {msg && (
        <p role="status">
          {msg.text} {msg.ride && <a className="underline" href={rideRoute(msg.ride)}>Open it</a>}
        </p>
      )}
      {error && <p role="alert">Couldn’t do that: {error}</p>}
    </div>
  )
}
