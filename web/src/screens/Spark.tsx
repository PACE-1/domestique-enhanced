import { plot } from "@/lib/analysis"

/** A tiny trend line with no axes. `label` is its text alternative. */
export function Spark({ values, label, color = "var(--chart-2)" }: { values: number[]; label: string; color?: string }) {
  const g = plot([{ name: label, color, points: values.map((y, x) => ({ x, y })) }], 80, 24, 2)
  if (values.length < 2 || !g) return null
  return (
    <svg role="img" aria-label={label} viewBox="0 0 80 24" className="h-6 w-20">
      <path d={g.paths[0].d} fill="none" style={{ stroke: color }} strokeWidth={1.5} />
    </svg>
  )
}
