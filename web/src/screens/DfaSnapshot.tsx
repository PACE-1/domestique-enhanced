import { getSnapshot } from "@/lib/dfa"
import { Panel, useLoad } from "@/screens/panel"

/** The most recent DFA α1 value from your rides, with the reason when there is none. */
export function DfaSnapshotCard() {
  const [load, retry] = useLoad(getSnapshot)
  return (
    <Panel title="DFA α1" load={load} retry={retry}>
      {(d) =>
        d.value !== null && d.value !== undefined ? (
          <p className="text-sm">
            <span className="font-medium">{d.value.toFixed(2)}</span> from {d.n_rides} recent {d.n_rides === 1 ? "ride" : "rides"}
            {d.last_computed_at ? `, last computed ${d.last_computed_at.slice(0, 10)}` : ""}.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No DFA α1 yet. {d.n_recent_total ? `${d.n_no_rr_data} of ${d.n_recent_total} recent rides have no beat-to-beat heart-rate data. ` : ""}
            Record rides with a chest strap that stores R-R intervals, then open the DFA tab.
          </p>
        )
      }
    </Panel>
  )
}
