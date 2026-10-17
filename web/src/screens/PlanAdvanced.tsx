import { useState } from "react"

import type { EntryScan, PlanPreview } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import type { GoalType } from "@/lib/home"
import { previewPlan, scanRides } from "@/lib/plan"
import { advancedProblem, type Advanced } from "@/lib/planForm"

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

interface Base {
  plan_weeks: number
  hours_per_week: number
  event_date?: string
}

/** The less common plan options. Nothing here is sent unless it differs from the default. */
export function PlanAdvanced({ a, set, goal, base, today, onRecommended }: { a: Advanced; set: (a: Advanced) => void; goal: GoalType; base: Base; today: string; onRecommended: (r: Record<string, number> | null) => void }) {
  const [preview, setPreview] = useState<PlanPreview | null>(null)
  const [scan, setScan] = useState<EntryScan | null>(null)
  const [busy, setBusy] = useState<"preview" | "scan" | null>(null)
  const [error, setError] = useState("")
  const up = (patch: Partial<Advanced>) => set({ ...a, ...patch })
  const why = advancedProblem(a, goal, today)
  const query = { goal, plan_weeks: base.plan_weeks, hours_per_week: base.hours_per_week, event_date: goal === "event" ? base.event_date : a.endDate || undefined }

  const look = async (kind: "preview" | "scan") => {
    setBusy(kind)
    setError("")
    try {
      if (kind === "preview") {
        const p = await previewPlan({ ...query, start_date: a.backdate ? a.startDate : undefined })
        setPreview(p)
        onRecommended(p.phase_weeks_rec as Record<string, number> | null)
      } else setScan(await scanRides(query))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }
  const editing = a.phaseWeeks ?? Object.fromEntries((preview?.phases ?? []).map((p) => [p.name, String(p.weeks)]))
  const field = "mt-1 block w-full"

  return (
    <div className="space-y-4 rounded-xl border p-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <Label className="flex-col items-start gap-1">
          Intensity mix
          <NativeSelect className={field} value={a.distribution} onChange={(e) => up({ distribution: e.target.value as Advanced["distribution"] })}>
            <option value="polarized">Polarized (default)</option>
            <option value="pyramidal">Pyramidal</option>
            <option value="threshold">Threshold and sweet spot</option>
          </NativeSelect>
        </Label>
        <Label className="flex-col items-start gap-1">
          Workout choice
          <NativeSelect className={field} value={a.mode} onChange={(e) => up({ mode: e.target.value as Advanced["mode"] })}>
            <option value="auto">Automatic, varied</option>
            <option value="fixed_core">Fixed core, repeatable</option>
            <option value="template">Template</option>
          </NativeSelect>
        </Label>
        {a.mode === "template" && (
          <Label className="flex-col items-start gap-1">
            Template
            <NativeSelect className={field} value={a.template} onChange={(e) => up({ template: e.target.value as Advanced["template"] })}>
              <option value="polarized_base">Polarized base</option>
              <option value="ftp_builder">FTP builder</option>
              <option value="custom">Custom shares</option>
            </NativeSelect>
          </Label>
        )}
        {goal === "continuous" && (
          <Label className="flex-col items-start gap-1">
            Focus
            <NativeSelect className={field} value={a.focus} onChange={(e) => up({ focus: e.target.value as Advanced["focus"] })}>
              <option value="both">FTP and VO2max</option>
              <option value="ftp">FTP</option>
              <option value="vo2">VO2max</option>
            </NativeSelect>
          </Label>
        )}
      </div>

      {a.mode === "template" && a.template === "custom" && (
        <fieldset className="space-y-1">
          <legend>Share of intensity time (%)</legend>
          <div className="flex flex-wrap gap-2">
            {(["tempo_ss", "threshold", "vo2", "sprint"] as const).map((k) => (
              <Label key={k} className="flex-col items-start gap-1">
                {{ tempo_ss: "Tempo and sweet spot", threshold: "Threshold", vo2: "VO2max", sprint: "Sprint" }[k]}
                <Input type="number" min={0} max={100} className="w-24" value={a.bands[k]} onChange={(e) => up({ bands: { ...a.bands, [k]: e.target.value } })} />
              </Label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap gap-4">
        <Label className="flex items-center gap-2">
          <Checkbox checked={a.block} onCheckedChange={(on) => up({ block: !!on })} />
          Block periodization
        </Label>
        <Label className="flex items-center gap-2">
          <Checkbox checked={a.vo2Micro} onCheckedChange={(on) => up({ vo2Micro: !!on })} />
          VO2max as micro-intervals only
        </Label>
      </div>

      {goal === "event" && (
        <div className="flex flex-wrap gap-3">
          <Label className="flex-col items-start gap-1">
            Distance (km)
            <Input type="number" min={1} className="w-28" value={a.eventKm} onChange={(e) => up({ eventKm: e.target.value })} />
          </Label>
          <Label className="flex-col items-start gap-1">
            Climbing (m)
            <Input type="number" min={0} className="w-28" value={a.eventClimb} onChange={(e) => up({ eventClimb: e.target.value })} />
          </Label>
          <Label className="flex-col items-start gap-1">
            Type
            <NativeSelect value={a.eventType} onChange={(e) => up({ eventType: e.target.value })}>
              <option value="granfondo">Gran fondo</option>
              <option value="century">Century</option>
              <option value="ultra">Ultra</option>
              <option value="crit">Crit</option>
              <option value="sportive">Sportive</option>
            </NativeSelect>
          </Label>
        </div>
      )}
      {goal !== "event" && goal !== "general" && goal !== "continuous" && (
        <Label className="flex-col items-start gap-1">
          End date (optional)
          <Input type="date" className="w-44" min={today} value={a.endDate} onChange={(e) => up({ endDate: e.target.value })} />
        </Label>
      )}

      <fieldset className="space-y-2">
        <legend>Extra races (B and C)</legend>
        {a.races.map((r, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <Input type="date" aria-label={`Race ${i + 1} date`} className="w-40" min={today} value={r.date} onChange={(e) => up({ races: a.races.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })} />
            <Input aria-label={`Race ${i + 1} name`} placeholder="Name" className="w-44" value={r.name} onChange={(e) => up({ races: a.races.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
            <NativeSelect aria-label={`Race ${i + 1} priority`} value={r.priority} onChange={(e) => up({ races: a.races.map((x, j) => (j === i ? { ...x, priority: e.target.value as "B" | "C" } : x)) })}>
              <option value="B">B</option>
              <option value="C">C</option>
            </NativeSelect>
            <Button size="sm" variant="ghost" onClick={() => up({ races: a.races.filter((_, j) => j !== i) })}>
              Remove race {i + 1}
            </Button>
          </div>
        ))}
        {goal !== "continuous" && (
          <Button size="sm" variant="outline" onClick={() => up({ races: [...a.races, { date: "", name: "", priority: "B" }] })}>
            Add a race
          </Button>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <Label className="flex items-center gap-2">
          <Checkbox checked={a.useDayHours} onCheckedChange={(on) => up({ useDayHours: !!on })} />
          Set the hours for each day (replaces hours per week and rest days)
        </Label>
        {a.useDayHours && (
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => (
              <Label key={d} className="flex-col items-start gap-1">
                {d}
                <Input type="number" min={0} max={12} step={0.5} aria-label={`Hours on ${d}`} className="w-20" value={a.dayHours[i]} onChange={(e) => up({ dayHours: a.dayHours.map((h, j) => (j === i ? e.target.value : h)) })} />
              </Label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <Label className="flex items-center gap-2">
          <Checkbox checked={a.backdate} onCheckedChange={(on) => up({ backdate: !!on, recognized: false })} />
          I have already been training: start the plan in the past
        </Label>
        {a.backdate && (
          <div className="flex flex-wrap items-end gap-2">
            <Label className="flex-col items-start gap-1">
              Start date
              <Input type="date" className="w-44" max={today} value={a.startDate} onChange={(e) => up({ startDate: e.target.value, recognized: false })} />
            </Label>
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => look("scan")}>
              {busy === "scan" ? "Scanning…" : "Scan my rides"}
            </Button>
          </div>
        )}
        {scan && a.backdate && (
          <div className="rounded-xl bg-muted p-2" role="status">
            {scan.proposal_weeks > 0 && scan.equivalent_start_date ? (
              <>
                <p>
                  Your last {scan.proposal_weeks} week{scan.proposal_weeks === 1 ? "" : "s"} of riding already count. Start at week {scan.entry_week} of {scan.plan_weeks}, from {scan.equivalent_start_date}
                  {scan.plan_end_date ? ` to ${scan.plan_end_date}` : ""}.
                </p>
                <Button size="sm" className="mt-1" onClick={() => up({ startDate: scan.equivalent_start_date!, recognized: true })}>
                  Use this start date
                </Button>
              </>
            ) : (
              <p>No recent weeks qualify, so the plan starts from week 1.</p>
            )}
            {a.recognized && <p className="text-muted-foreground">Start date set from your rides.</p>}
          </div>
        )}
      </fieldset>

      <div className="space-y-2">
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => look("preview")}>
          {busy === "preview" ? "Working it out…" : "Preview the phases"}
        </Button>
        {preview && (
          <div className="space-y-2">
            <ul className="divide-y">
              {preview.phases.map((p) => (
                <li key={p.name} className="flex flex-wrap items-center justify-between gap-2 py-1">
                  <span>
                    {p.name} · {p.start} to {p.end}
                  </span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {p.weekly_tss ? `${Math.round(p.weekly_tss)} TSS/week · ` : ""}
                    <Input type="number" min={1} max={30} aria-label={`${p.name} weeks`} className="w-16" value={editing[p.name] ?? String(p.weeks)} onChange={(e) => up({ phaseWeeks: { ...editing, [p.name]: e.target.value } })} />
                    weeks
                  </span>
                </li>
              ))}
            </ul>
            {preview.phase_weeks_disabled_reason && <p className="text-muted-foreground">{preview.phase_weeks_disabled_reason}</p>}
            {preview.phase_weeks_status?.startsWith("fallback") && <p>That phase split can’t be used ({preview.phase_weeks_status.replace("fallback:", "")}). The recommended split applies.</p>}
            {a.phaseWeeks && (
              <Button size="sm" variant="ghost" onClick={() => up({ phaseWeeks: null })}>
                Use the recommended split
              </Button>
            )}
          </div>
        )}
      </div>
      {why && <p>{why}</p>}
      {error && <p role="alert">Couldn’t do that: {error}</p>}
    </div>
  )
}
