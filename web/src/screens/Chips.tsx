import { Button } from "@/components/ui/button"

/** A row of toggle buttons for picking any number of options. */
export function Chips({ label, options, value, onChange }: { label: string; options: readonly (readonly [string, string])[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {options.map(([id, text]) => {
        const on = value.includes(id)
        return (
          <Button key={id} size="xs" variant={on ? "default" : "outline"} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== id) : [...value, id])}>
            {text}
          </Button>
        )
      })}
    </div>
  )
}
