import { useEffect, useState } from "react"

import type { MigrationResult, UpdateCheck } from "@/api/types"
import { Button } from "@/components/ui/button"
import { checkUpdate } from "@/lib/settings"
import { getMigration } from "@/lib/wellness"

const SEEN = "dq_notice_seen"

/** Two things worth saying once: the app was updated, and a newer release exists. Each can be dismissed. */
export function Notices() {
  const [mig, setMig] = useState<MigrationResult | null>(null)
  const [upd, setUpd] = useState<UpdateCheck | null>(null)
  const [hidden, setHidden] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(SEEN) ?? "[]") } catch { return [] }
  })
  useEffect(() => {
    getMigration().then(setMig, () => {})
    checkUpdate(false).then(setUpd, () => {}) // notices are optional: stay silent when either call fails
  }, [])
  const hide = (key: string) => {
    const next = [...hidden, key]
    setHidden(next)
    try { localStorage.setItem(SEEN, JSON.stringify(next)) } catch { /* private mode: it just shows again next time */ }
  }
  const items: { key: string; text: string }[] = []
  if (mig?.show_toast) items.push({ key: `mig:${mig.to_version}`, text: `Updated from ${mig.from_version} to ${mig.to_version}. Your rider data was kept.` })
  if (upd?.update_available && upd.latest) items.push({ key: `upd:${upd.latest}`, text: `Version ${upd.latest} is available (you have ${upd.current}).` })
  const shown = items.filter((i) => !hidden.includes(i.key))
  if (!shown.length) return null
  return (
    <div className="mb-4 space-y-2">
      {shown.map((i) => (
        <div key={i.key} role="status" className="flex items-center justify-between gap-2 rounded-xl border p-3 text-sm">
          <span>
            {i.text}{" "}
            {i.key.startsWith("upd:") && upd?.release_url && <a className="underline" href={upd.release_url}>Release notes</a>}
          </span>
          <Button size="sm" variant="ghost" onClick={() => hide(i.key)}>
            Dismiss
          </Button>
        </div>
      ))}
    </div>
  )
}
