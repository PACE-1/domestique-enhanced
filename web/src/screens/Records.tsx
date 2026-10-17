import { useEffect, useState } from "react"

import type { PrToastQueue } from "@/api/types"
import { Card, CardContent } from "@/components/ui/card"
import { getPrQueue, rideRoute } from "@/lib/rides"

/** New personal records since the last look. Reading clears the queue, so this shows once and stays quiet otherwise. */
export function Records() {
  const [q, setQ] = useState<PrToastQueue | null>(null)
  useEffect(() => {
    getPrQueue(true).then(setQ, () => {}) // a record banner is a nicety: say nothing if it can't load
  }, [])
  if (!q || q.count === 0) return null
  return (
    <Card className="md:col-span-2">
      <CardContent className="space-y-1 p-4 text-sm" role="status">
        <h2 className="font-semibold">New personal records</h2>
        <ul className="list-disc pl-5">
          {q.queue.map((x) => {
            const r = x as { ride_id?: string; started_at?: string; n_prs?: number }
            return (
              <li key={r.ride_id}>
                <a className="underline" href={rideRoute(r.ride_id ?? "")}>
                  {r.started_at ? new Date(r.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "A ride"}
                </a>
                : {r.n_prs} new record{r.n_prs === 1 ? "" : "s"}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
