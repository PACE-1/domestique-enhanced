import { useState } from "react"

import type { WorkoutFolders } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getFolders, setExtraFolder } from "@/lib/settings"
import { Panel, useLoad } from "@/screens/panel"

/** The built-in library is always on. One extra folder of your own .zwo files can be added to it. */
export function Folders() {
  const [load, retry] = useLoad<WorkoutFolders>(getFolders)
  const [shown, setShown] = useState<WorkoutFolders | null>(null)
  const [path, setPath] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const save = async (value: string) => {
    setBusy(true)
    setError("")
    try {
      const f = await setExtraFolder(value)
      setShown(f)
      setPath("")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel title="Workout library" load={load} retry={retry}>
      {(loaded) => {
        const f = shown ?? loaded
        return (
          <div className="space-y-3 text-sm">
            <p>Built-in library: {f.builtin.count} workouts, always included.</p>
            {f.extra ? (
              <p>
                Your extra folder: <code className="break-all">{f.extra.path}</code> ({f.extra.files} files, {f.extra.added} of them add workouts the built-in library does not have).
              </p>
            ) : (
              <p className="text-muted-foreground">No extra folder.</p>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <Label className="flex-col items-start gap-1">
                Folder with your own .zwo files
                <Input className="w-80" placeholder="/home/you/Workouts" value={path} onChange={(e) => setPath(e.target.value)} />
              </Label>
              <Button size="sm" disabled={busy || !path.trim()} onClick={() => save(path.trim())}>
                {f.extra ? "Change folder" : "Add folder"}
              </Button>
              {f.extra && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => save("")}>
                  Remove folder
                </Button>
              )}
            </div>
            {error && <p role="alert">{error}</p>}
          </div>
        )
      }}
    </Panel>
  )
}
