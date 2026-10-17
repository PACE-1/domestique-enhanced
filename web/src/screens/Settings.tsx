import { useCallback, useEffect, useState } from "react"

import type { IcuConnection, SettingsRead, SyncStatus, UpdateCheck, VersionInfo, ZoneBand } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Input } from "@/components/ui/input"
import { checkUpdate, diff, formFrom, getSettings, getSyncStatus, getVersion, saveSettings, syncNow, type RiderForm } from "@/lib/settings"
import { getIcuConnection, getLimits, type Limits } from "@/lib/setup"
import { FtpHistory } from "@/screens/FtpHistory"
import { Panel, Row, useLoad } from "@/screens/panel"

const Zones = ({ title, zones, unit }: { title: string; zones: ZoneBand[]; unit: string }) => (
  <div>
    <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
    <dl className="space-y-0.5">
      {zones.map((z) => (
        <Row key={z.zone} label={z.name || z.zone} value={z.high >= 9999 ? `${z.low}+ ${unit}` : `${z.low} to ${z.high} ${unit}`} />
      ))}
    </dl>
  </div>
)

function RiderForm_({ s, limits, saved }: { s: SettingsRead; limits: Limits; saved: (now: SettingsRead) => void }) {
  const [f, setF] = useState<RiderForm>(() => formFrom(s))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const { changes, problems } = diff(s, f, limits)
  const dirty = Object.keys(changes).length > 0
  const set = (k: keyof RiderForm, v: string) => setF({ ...f, [k]: v } as RiderForm)

  const submit = async () => {
    setBusy(true)
    setError("")
    try {
      saved((await saveSettings(changes)).settings)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const field = (k: "weight" | "ftp" | "lthr" | "maxHr", label: string) => (
    <Label className="flex-col items-start gap-1">
      {label}
      <Input type="number" className="w-28" value={f[k]} onChange={(e) => set(k, e.target.value)} />
    </Label>
  )
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-end gap-3">
        {field("weight", "Weight (kg)")}
        {field("ftp", "FTP (W)")}
        {field("lthr", "LTHR (bpm)")}
        {field("maxHr", "Max HR (bpm)")}
        <Label className="flex-col items-start gap-1">
          Targets
          <NativeSelect  value={f.targetMode} onChange={(e) => set("targetMode", e.target.value)}>
            <option value="power">Power</option>
            <option value="hr">Heart rate</option>
          </NativeSelect>
        </Label>
      </div>
      <p className="text-muted-foreground">
        {s.w_per_kg ? `${s.w_per_kg} W/kg. ` : ""}
        FTP source: {s.ftp_source ?? "manual"}
        {s.ftp_source_date ? ` (${s.ftp_source_date.slice(0, 10)})` : ""}
        {s.eftp ? `. intervals.icu estimates ${Math.round(s.eftp)} W.` : "."}
      </p>
      {problems.map((p) => (
        <p key={p}>{p}</p>
      ))}
      <Button size="sm" disabled={busy || !dirty || problems.length > 0} onClick={submit}>
        Save changes
      </Button>
      {error && <p role="alert">Couldn’t save: {error}</p>}
    </div>
  )
}

function Rider() {
  const [load, retry] = useLoad<SettingsRead>(getSettings)
  const [limits, setLimits] = useState<Limits>({})
  // After a save the server's answer replaces the loaded value in place, so the card never flashes back to "Loading…".
  const [now, setNow] = useState<{ s: SettingsRead; n: number } | null>(null)
  useEffect(() => { getLimits().then(setLimits, () => {}) }, [])
  return (
    <Panel title="Rider" load={load} retry={retry}>
      {(loaded) => {
        const s = now?.s ?? loaded
        return (
          <div className="space-y-4">
            <RiderForm_ key={now?.n ?? 0} s={s} limits={limits} saved={(fresh) => setNow({ s: fresh, n: (now?.n ?? 0) + 1 })} />
            {now && <p role="status">Saved.</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Zones title="Power zones" zones={s.power_zones} unit="W" />
              <Zones title="Heart-rate zones" zones={s.hr_zones} unit="bpm" />
            </div>
          </div>
        )
      }}
    </Panel>
  )
}

function Sync() {
  const [conn, retryConn] = useLoad<IcuConnection>(getIcuConnection)
  const [status, retryStatus] = useLoad<SyncStatus>(getSyncStatus)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const go = useCallback(async () => {
    setBusy(true)
    setError("")
    try {
      await syncNow()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      retryStatus()
    }
  }, [retryStatus])
  return (
    <Panel title="intervals.icu" load={conn} retry={retryConn}>
      {(c) => (
        <div className="space-y-3 text-sm">
          <p>
            {c.connected ? `Connected${c.name ? ` as ${c.name}` : ""}${c.write_ok ? "" : ", read only"}.` : "Not connected. Connect it in the current dashboard's Settings."}
          </p>
          {c.needs_oauth_migration && <p>This connection uses an old API key. Reconnect to switch to sign-in.</p>}
          {status.state === "ok" && (
            <p className="text-muted-foreground">
              {status.data.activity_records} rides and {status.data.wellness_records} wellness days stored
              {status.data.last_sync ? `. Last sync: ${String((status.data.last_sync as { timestamp?: string }).timestamp ?? "recorded")}.` : ". Never synced."}
              {status.data.auth_disabled ? " Background sync is paused: reconnect to resume." : ""}
            </p>
          )}
          {status.state === "error" && <p role="alert">Couldn’t read the sync state: {status.message}</p>}
          <Button size="sm" disabled={busy || !c.connected} onClick={go}>
            {busy ? "Syncing…" : "Sync now"}
          </Button>
          {error && <p role="alert">Sync failed: {error}</p>}
        </div>
      )}
    </Panel>
  )
}

function About() {
  const [v] = useLoad<VersionInfo>(getVersion)
  const [update, setUpdate] = useState<UpdateCheck | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const check = async () => {
    setBusy(true)
    setError("")
    try {
      setUpdate(await checkUpdate(true))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel title="About" load={v} retry={() => location.reload()}>
      {(info) => (
        <div className="space-y-2 text-sm">
          <dl className="space-y-1">
            <Row label="Version" value={info.version} />
            <Row label="Data folder" value={<code className="break-all">{info.data_dir}</code>} />
          </dl>
          <Button size="sm" variant="outline" disabled={busy} onClick={check}>
            Check for updates
          </Button>
          {update && (
            <p role="status">
              {update.error
                ? `Couldn’t reach the release server: ${update.error}`
                : update.update_available
                  ? <>Version {update.latest} is available. {update.release_url && <a className="underline" href={update.release_url}>Release notes</a>}</>
                  : "You are on the latest version."}
            </p>
          )}
          {error && <p role="alert">Couldn’t check: {error}</p>}
        </div>
      )}
    </Panel>
  )
}

export function Settings() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-label="Settings">
      <div className="lg:col-span-2">
        <Rider />
      </div>
      <Sync />
      <About />
      <div className="lg:col-span-2">
        <FtpHistory />
      </div>
    </div>
  )
}
