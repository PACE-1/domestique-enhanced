import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { LastWeek, ThisWeek } from "@/screens/WeekSummary"

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
const WEEK = {
  week_start: "2026-10-05", week_end: "2026-10-11", tss_target: 300, tss_done: 410, tss_adherence_pct: 137,
  duration_min_done: 400, duration_min_planned: 320, sports: { Ride: 4, Run: 1 },
  exposure_minutes: { low_aerobic: 200, mid_aerobic: 90, high_aerobic: 60, anaerobic: 10 },
  exposure_minutes_planned: { low_aerobic: 220, mid_aerobic: 30, high_aerobic: 40, anaerobic: 0 },
  overreach: true, overreach_reasons: ["TSS 137% of plan"],
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const stub = (body: unknown, status = 200) => { const urls: string[] = []; vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(u); return json(body, status) })); return urls }

describe("week summary", () => {
  it("shows done against planned and warns about an overreach", async () => {
    const urls = stub(WEEK)
    render(<LastWeek />)
    expect(await screen.findByText(/2026-10-05 to 2026-10-11 · 5 activities/)).toBeTruthy()
    expect(urls[0]).toBe("/api/week-summary?week_offset=-1")
    expect(screen.getByText("410")).toBeTruthy()
    expect(screen.getByText(/Overreach\. TSS 137% of plan\./)).toBeTruthy()
  })

  it("says so when a week has no plan, and when it matched", async () => {
    stub({ ...WEEK, tss_target: null, tss_adherence_pct: null, overreach: false })
    render(<ThisWeek />)
    expect(await screen.findByText(/no plan on record/)).toBeTruthy()
    cleanup()
    stub({ ...WEEK, tss_done: 310, tss_adherence_pct: 103, overreach: false })
    render(<ThisWeek />)
    expect(await screen.findByText("Load matched the plan (103%).")).toBeTruthy()
  })

  it("keeps an empty week short and reports a failure", async () => {
    stub({ ...WEEK, tss_target: null, tss_done: 0, sports: {} })
    render(<ThisWeek />)
    expect(await screen.findByText("Nothing planned or ridden this week.")).toBeTruthy()
    cleanup()
    stub({ error: "boom" }, 500)
    render(<ThisWeek />)
    expect((await screen.findByRole("alert")).textContent).toContain("boom")
  })
})
