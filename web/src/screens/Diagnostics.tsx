import { useState } from "react"

import type { DiagErrors, DiagHealth, LogTail } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { getErrors, getHealth, getLogs } from "@/lib/settings"

type Shown = { logs?: LogTail; errors?: DiagErrors; health?: DiagHealth }

/** For bug reports: the end of the log, the recent errors and a health check. Local use only. */
export function Diagnostics() {
  const [lines, setLines] = useState(100)
  const [shown, setShown] = useState<Shown>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const load = async (what: keyof Shown) => {
    setBusy(true)
    setError("")
    try {
      if (what === "logs") setShown({ logs: await getLogs(lines) })
      if (what === "errors") setShown({ errors: await getErrors() })
      if (what === "health") setShown({ health: await getHealth() })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const failing = shown.health ? Object.entries(shown.health.checks).filter(([, v]) => (v as { ok?: boolean })?.ok === false) : []
  return (
    <Card>
      <CardContent className="space-y-3 p-4 text-sm">
        <h2 className="font-semibold">Diagnostics</h2>
        <div className="flex flex-wrap items-end gap-2">
          <Label className="flex-col items-start gap-1">
            Log lines
            <NativeSelect value={lines} onChange={(e) => setLines(Number(e.target.value))}>
              {[50, 100, 300].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </Label>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => load("logs")}>
            Show the log
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => load("errors")}>
            Recent errors
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => load("health")}>
            Check health
          </Button>
        </div>
        {error && <p role="alert">Couldn’t load that: {error}</p>}
        {shown.logs &&
          (shown.logs.exists ? (
            <pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs" aria-label="Log">{shown.logs.lines.join("\n")}</pre>
          ) : (
            <p>There is no log file yet.</p>
          ))}
        {shown.errors &&
          (shown.errors.count === 0 ? (
            <p>No errors recorded since the app started.</p>
          ) : (
            <ul className="divide-y">
              {shown.errors.items.map((e, i) => {
                const x = e as { ts?: string; code?: string; exc_msg?: string }
                return (
                  <li key={i} className="py-1">
                    <span className="font-medium">{x.code}</span> <span className="text-muted-foreground">{x.ts}</span>
                    {x.exc_msg && <div className="text-muted-foreground">{x.exc_msg}</div>}
                  </li>
                )
              })}
            </ul>
          ))}
        {shown.health && (
          <div role="status">
            {failing.length === 0 ? (
              <p>Every check passed.</p>
            ) : (
              <>
                <p>{failing.length} check{failing.length === 1 ? "" : "s"} need attention:</p>
                <ul className="list-disc pl-5">
                  {failing.map(([k, v]) => (
                    <li key={k}>
                      {k.replace(/_/g, " ")}
                      {(v as { code?: string }).code ? `: ${(v as { code?: string }).code}` : ""}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
