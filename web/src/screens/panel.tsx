import { useCallback, useEffect, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export type Load<T> = { state: "loading" } | { state: "ok"; data: T } | { state: "error"; message: string }

// One independent request per card: a failure in one leaves the others usable and is retried alone.
export function useLoad<T>(fetcher: () => Promise<T>) {
  const [value, setValue] = useState<Load<T>>({ state: "loading" })
  const run = useCallback(() => {
    setValue({ state: "loading" })
    fetcher().then(
      (data) => setValue({ state: "ok", data }),
      (e: unknown) => setValue({ state: "error", message: e instanceof Error ? e.message : String(e) }),
    )
  }, [fetcher])
  useEffect(run, [run])
  return [value, run] as const
}

export function Panel<T>({
  title,
  load,
  retry,
  children,
}: {
  title: string
  load: Load<T>
  retry: () => void
  children: (data: T) => ReactNode
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {load.state === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
        {load.state === "error" && (
          <div role="alert" className="text-sm">
            <p>Couldn’t load this: {load.message}</p>
            <Button className="mt-2" size="sm" variant="outline" onClick={retry}>
              Retry
            </Button>
          </div>
        )}
        {load.state === "ok" && children(load.data)}
      </CardContent>
    </Card>
  )
}

export const Row = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="flex justify-between gap-4 text-sm">
    <dt className="text-muted-foreground">{label}</dt>
    <dd>{value}</dd>
  </div>
)

