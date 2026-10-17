import { plot, type Series } from "@/lib/analysis"

/** A small line chart. `summary` is the text alternative for the whole chart. */
export function LineChart({ series, summary, unit }: { series: Series[]; summary: string; unit: string }) {
  const g = plot(series, 300, 100)
  if (!g) return null
  return (
    <figure className="space-y-1">
      <svg role="img" aria-label={summary} viewBox="0 0 300 100" className="h-32 w-full">
        {g.zeroY !== null && <line x1={0} x2={300} y1={g.zeroY} y2={g.zeroY} className="stroke-muted-foreground/40" strokeDasharray="3 3" />}
        {g.paths.map((p) => (
          <path key={p.name} d={p.d} fill="none" stroke={p.color} strokeWidth={1.5} />
        ))}
      </svg>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex gap-3">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1">
              <span aria-hidden className="inline-block h-2 w-3 rounded-sm" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </span>
        <span>
          {Math.round(g.y0)} to {Math.round(g.y1)} {unit}
        </span>
      </figcaption>
    </figure>
  )
}
