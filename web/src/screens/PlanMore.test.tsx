import { cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { isoDay } from "@/lib/home"
import { Plan } from "@/screens/Plan"
import { PlanCalendar } from "@/screens/PlanCalendar"
import { PlanGenerate } from "@/screens/PlanGenerate"
import { SessionExport } from "@/screens/SessionExport"

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
type Handler = (body: unknown) => Response
function mock(routes: Record<string, Handler>) {
  const calls: { url: string; method?: string; body: unknown }[] = []
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body
    calls.push({ url, method: init?.method, body })
    const key = Object.keys(routes).find((k) => url === k || url.startsWith(k + "?"))
    return key ? routes[key](body) : json({}, 404)
  }))
  return calls
}
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDay(d) }
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const planned = (over = {}) => ({ session_type: "z2", name: "Endurance", display_name: "Endurance", duration_min: 90, tss: 60, zwo_file: "z2.zwo", status: "pending", user_moved: false, is_race: false, ...over })
const day = (n: number, over = {}) => ({ date: addDays(n), dow: 0, is_today: n === 0, planned: planned(), actual: null, card_state: "planned", race: null, ...over })
const CAL = (days: unknown[]) => ({ today: addDays(0), current_iso_week: { year: 2026, week: 42 }, summary: {}, weeks: [{ iso_year: 2026, iso_week: 42, start_date: addDays(0), end_date: addDays(6), phase: "base", is_stepback: false, is_current: true, planned_tss: 300, actual_tss: 120, days }] })

describe("PlanCalendar", () => {
  it("shows planned and ridden days and links to the ride", async () => {
    mock({ "/api/calendar": () => json(CAL([day(0, { actual: { ride_id: "icu_1", tss: 55 } }), day(1, { planned: planned({ session_type: "rest", name: "Rest" }) })])) })
    render(<PlanCalendar onOpenWeek={() => {}} onChanged={() => {}} />)
    expect((await screen.findAllByText("Endurance"))[0]).toBeTruthy()
    expect(screen.getByRole("link", { name: "Rode 55 TSS" }).getAttribute("href")).toBe("#/ride/icu_1")
    expect(screen.getByText(/120 of 300 TSS/)).toBeTruthy()
  })

  it("moves a session when it is dropped on another day, and says whether it swapped", async () => {
    const calls = mock({
      "/api/calendar": () => json(CAL([day(1), day(2, { planned: planned({ session_type: "rest", name: "Rest" }) })])),
      "/api/plan/move-session": () => json({ ok: true, moved: {}, vacated: addDays(1) }),
    })
    const onChanged = vi.fn()
    render(<PlanCalendar onOpenWeek={() => {}} onChanged={onChanged} />)
    await screen.findAllByRole("group")
    const cells = screen.getAllByRole("group")
    const from = cells.find((c) => c.getAttribute("aria-label")?.includes("Endurance"))!
    const to = cells.find((c) => c.getAttribute("aria-label")?.includes("rest"))!
    const store: Record<string, string> = {}
    const dt = { setData: (k: string, v: string) => { store[k] = v }, getData: (k: string) => store[k], effectAllowed: "" }
    fireEvent(from, Object.assign(createEvent.dragStart(from), { dataTransfer: dt }))
    fireEvent(to, Object.assign(createEvent.dragOver(to), { dataTransfer: dt }))
    fireEvent(to, Object.assign(createEvent.drop(to), { dataTransfer: dt }))
    expect((await screen.findByRole("status")).textContent).toMatch(/Moved /)
    expect(calls.find((c) => c.url === "/api/plan/move-session")!.body).toEqual({ date: addDays(1), new_date: addDays(2) })
    expect(onChanged).toHaveBeenCalled()
  })

  it("only accepts a drop within the same week", async () => {
    const calls = mock({
      "/api/calendar": () => json({ ...CAL([day(1)]), weeks: [CAL([day(1)]).weeks[0], { ...CAL([]).weeks[0], start_date: addDays(7), end_date: addDays(13), is_current: false, days: [day(8, { planned: planned({ session_type: "rest", name: "Rest" }) })] }] }),
      "/api/plan/move-session": () => json({ ok: true }),
    })
    render(<PlanCalendar onOpenWeek={() => {}} onChanged={() => {}} />)
    await screen.findAllByRole("group")
    const cells = screen.getAllByRole("group")
    const from = cells.find((c) => c.getAttribute("aria-label")?.includes("Endurance"))!
    const other = cells.find((c) => c.getAttribute("aria-label")?.includes("rest"))!
    fireEvent(from, Object.assign(createEvent.dragStart(from), { dataTransfer: { setData() {}, effectAllowed: "" } }))
    const over = Object.assign(createEvent.dragOver(other), { dataTransfer: {} })
    fireEvent(other, over)
    expect(over.defaultPrevented).toBe(false)
    fireEvent(other, Object.assign(createEvent.drop(other), { dataTransfer: { getData: () => "" } }))
    await new Promise((r) => setTimeout(r, 20))
    expect(calls.some((c) => c.url === "/api/plan/move-session")).toBe(false)
  })

  it("does not let a past day or a race be dragged", async () => {
    mock({ "/api/calendar": () => json(CAL([day(-1), day(1, { planned: planned({ is_race: true }) })])) })
    render(<PlanCalendar onOpenWeek={() => {}} onChanged={() => {}} />)
    await screen.findAllByRole("group")
    for (const c of screen.getAllByRole("group")) expect(c.getAttribute("draggable")).not.toBe("true")
  })

  it("shows the server's reason when a move is refused, and opens a week in the list", async () => {
    mock({
      "/api/calendar": () => json(CAL([day(1), day(2, { planned: planned({ session_type: "rest", name: "Rest" }) })])),
      "/api/plan/move-session": () => json({ error: "That day has already been ridden." }, 409),
    })
    const open = vi.fn()
    render(<PlanCalendar onOpenWeek={open} onChanged={() => {}} />)
    await screen.findAllByRole("group")
    const cells = screen.getAllByRole("group")
    const from = cells[0]
    const to = cells[1]
    fireEvent(from, Object.assign(createEvent.dragStart(from), { dataTransfer: { setData() {}, effectAllowed: "" } }))
    fireEvent(to, Object.assign(createEvent.drop(to), { dataTransfer: { getData: () => "" } }))
    expect((await screen.findByRole("alert")).textContent).toContain("already been ridden")
    await userEvent.click(screen.getByRole("button", { name: "Open week" }))
    expect(open).toHaveBeenCalledWith(addDays(0))
  })

  it("explains a calendar that could not be built", async () => {
    mock({ "/api/calendar": () => json({ today: addDays(0), weeks: [], error: "E_PLAN_PARSE_CORRUPT" }) })
    render(<PlanCalendar onOpenWeek={() => {}} onChanged={() => {}} />)
    expect((await screen.findByRole("alert")).textContent).toContain("E_PLAN_PARSE_CORRUPT")
  })
})

describe("SessionExport", () => {
  it("links the .zwo and .fit files and adds the session to the calendar", async () => {
    const calls = mock({ "/api/calendar/push-workout": () => json({ ok: true }) })
    render(<SessionExport file="a b.zwo" day="2026-10-20" name="Sweet spot" type="sweetspot" minutes={89.6} />)
    expect(screen.getByRole("link", { name: /Download .zwo/ }).getAttribute("href")).toBe("/api/download/zwo/a%20b.zwo")
    expect(screen.getByRole("link", { name: /Download .fit/ }).getAttribute("href")).toBe("/api/export/fit-workout?zwo_file=a+b.zwo&name=Sweet+spot&session_type=sweetspot&duration_min=90")
    await userEvent.click(screen.getByRole("button", { name: /Add 2026-10-20 to intervals.icu/ }))
    expect((await screen.findByRole("status")).textContent).toContain("Added to your intervals.icu calendar")
    expect(calls[0].body).toEqual({ source: "planner", zwo_file: "a b.zwo", date: "2026-10-20" })
  })

  it("says what to do when the push needs a reconnect, LTHR, or fails", async () => {
    let reply: unknown = { needs_reconnect: true }
    mock({ "/api/calendar/push-workout": () => json(reply) })
    render(<SessionExport file="a.zwo" day="2026-10-20" name="x" type="z2" minutes={60} />)
    const btn = () => screen.getByRole("button", { name: /to intervals.icu|Add 2026/ })
    await userEvent.click(btn())
    expect((await screen.findByRole("status")).textContent).toContain("Reconnect intervals.icu")
    reply = { needs_lthr: true }
    await userEvent.click(btn())
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Set your LTHR"))
    reply = { error: "date_out_of_range" }
    await userEvent.click(btn())
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("date out of range"))
  })
})

describe("PlanGenerate advanced options", () => {
  const open = async () => { await userEvent.click(screen.getByRole("button", { name: "More options…" })) }

  it("sends nothing extra until an option changes", async () => {
    const posts: unknown[] = []
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => { posts.push(JSON.parse(String(init?.body))); return json({}) }))
    render(<PlanGenerate hasPlan={false} onDone={() => {}} />)
    await open()
    await userEvent.click(screen.getByRole("button", { name: "Create plan" }))
    await waitFor(() => expect(posts.length).toBe(1))
    expect(posts[0]).toEqual({ goal: "general", hours_per_week: 8, plan_weeks: 12, rest_days: [0] })
  })

  it("sends the chosen mix, template, races and per-day hours", async () => {
    const posts: Record<string, unknown>[] = []
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => { posts.push(JSON.parse(String(init?.body))); return json({}) }))
    render(<PlanGenerate hasPlan={false} onDone={() => {}} />)
    await userEvent.selectOptions(screen.getByLabelText("Goal"), "vo2max")
    await open()
    await userEvent.selectOptions(screen.getByLabelText("Intensity mix"), "pyramidal")
    await userEvent.click(screen.getByRole("checkbox", { name: "Block periodization" }))
    await userEvent.click(screen.getByRole("button", { name: "Add a race" }))
    await userEvent.type(screen.getByLabelText("Race 1 date"), addDays(40))
    await userEvent.type(screen.getByLabelText("Race 1 name"), "Crit")
    await userEvent.click(screen.getByRole("checkbox", { name: /Set the hours for each day/ }))
    for (const d of ["Mon", "Tue", "Sat"]) await userEvent.type(screen.getByLabelText(`Hours on ${d}`), "2")
    await userEvent.click(screen.getByRole("button", { name: "Create plan" }))
    await waitFor(() => expect(posts.length).toBe(1))
    expect(posts[0]).toMatchObject({ goal: "vo2max", distribution: "pyramidal", block_periodization: true, events: [{ date: addDays(40), priority: "B", name: "Crit" }], daily_availability: { 0: 2, 1: 2, 2: 0, 3: 0, 4: 0, 5: 2, 6: 0 }, hours_per_week: 6, rest_days: [2, 3, 4, 6] })
  })

  it("blocks submit on a bad advanced value and says why", async () => {
    mock({})
    render(<PlanGenerate hasPlan={false} onDone={() => {}} />)
    await open()
    await userEvent.click(screen.getByRole("checkbox", { name: /start the plan in the past/ }))
    expect(screen.getAllByText(/Pick a start date/).length).toBeGreaterThan(0)
    expect((screen.getByRole("button", { name: "Create plan" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("scans rides, offers the proposed start, and sends it as recognized", async () => {
    const posts: Record<string, unknown>[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/plan/entry-scan")) return json({ proposal_weeks: 3, equivalent_start_date: addDays(-21), entry_week: 4, plan_weeks: 12, plan_end_date: addDays(63), weeks_remaining: 9 })
      posts.push(JSON.parse(String(init?.body)))
      return json({})
    }))
    render(<PlanGenerate hasPlan={false} onDone={() => {}} />)
    await open()
    await userEvent.click(screen.getByRole("checkbox", { name: /start the plan in the past/ }))
    await userEvent.click(screen.getByRole("button", { name: "Scan my rides" }))
    expect((await screen.findByRole("status")).textContent).toContain("Start at week 4 of 12")
    await userEvent.click(screen.getByRole("button", { name: "Use this start date" }))
    await userEvent.click(screen.getByRole("button", { name: "Create plan" }))
    await waitFor(() => expect(posts.length).toBe(1))
    expect(posts[0]).toMatchObject({ start_date: addDays(-21), entry_mode: "recognized" })
  })

  it("previews the phases and sends an edited split only when it differs", async () => {
    const posts: Record<string, unknown>[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/plan/preview")) return json({ ok: true, plan_weeks: 12, phase_weeks_rec: { base: 6, build1: 6 }, phases: [{ name: "base", weeks: 6, start: "a", end: "b", weekly_tss: 300 }, { name: "build1", weeks: 6, start: "c", end: "d" }] })
      posts.push(JSON.parse(String(init?.body)))
      return json({})
    }))
    render(<PlanGenerate hasPlan={false} onDone={() => {}} />)
    await open()
    await userEvent.click(screen.getByRole("button", { name: "Preview the phases" }))
    expect(await screen.findByText(/base · a to b/)).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "Create plan" }))
    await waitFor(() => expect(posts.length).toBe(1))
    expect(posts[0].phase_weeks).toBeUndefined()
    const base = screen.getByLabelText("base weeks")
    await userEvent.clear(base)
    await userEvent.type(base, "8")
    await userEvent.click(screen.getByRole("button", { name: "Create plan" }))
    await waitFor(() => expect(posts.length).toBe(2))
    expect(posts[1].phase_weeks).toEqual({ base: 8, build1: 6 })
  })
})

describe("Plan toolbar", () => {
  const session = (d: string) => ({ day: d, day_name: "", session_type: "z2", duration_min: 60, tss_estimate: 50, description: "", zwo_name: "Ride", zwo_file: "r.zwo", status: "pending" })
  const PLAN = { plan_json: { goal: {}, phases: [], weeks: [{ week_num: 1, start: addDays(-1), end: addDays(5), phase: "base", tss_target: 300, is_stepback: false, sessions: [session(addDays(1))] }] } }

  it("updates the plan and shows the server's message", async () => {
    const calls = mock({
      "/api/plan": () => json(PLAN),
      "/api/plan/daily-adapt": () => json({ projection_only: true, projected_adaptations: [{ reason: "TSB is low" }] }),
      "/api/plan/update": () => json({ ok: true, action: "reforecast", status_message: "Adjusted 2 sessions." }),
    })
    render(<Plan />)
    expect(await screen.findByText(/Suggested adjustment: TSB is low/)).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "Update plan" }))
    expect((await screen.findByText("Adjusted 2 sessions.")).textContent).toBeTruthy()
    expect(calls.some((c) => c.url === "/api/plan/update" && c.method === "POST")).toBe(true)
  })

  it("refreshes an old plan when the page opens, and offers a re-plan when fitness has drifted", async () => {
    const drifted = { plan_json: { ...PLAN.plan_json, ctl_drift: { exceeded: true, snapshot_ctl: 50, live_ctl: 62.4 } } }
    let plan: unknown = drifted
    mock({
      "/api/plan": () => json(plan),
      "/api/plan/daily-adapt": () => json({ projected_adaptations: [] }),
      "/api/plan/auto-recalc": () => { plan = PLAN; return json({ action: "recalculated", weeks_regenerated: 3, plan_json: PLAN.plan_json }) },
    })
    render(<Plan />)
    expect((await screen.findByText("Plan refreshed (3 weeks updated).")).textContent).toBeTruthy()
    await waitFor(() => expect(screen.queryByText(/The plan assumes fitness 50/)).toBeNull())
  })

  it("shows the drift note and opens the generator from it", async () => {
    mock({
      "/api/plan": () => json({ plan_json: { ...PLAN.plan_json, ctl_drift: { exceeded: true, snapshot_ctl: 50, live_ctl: 62.4 } } }),
      "/api/plan/daily-adapt": () => json({ projected_adaptations: [] }),
      "/api/plan/auto-recalc": () => json({ action: "fresh" }),
    })
    render(<Plan />)
    expect(await screen.findByText(/The plan assumes fitness 50; you are at 62\./)).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "Re-plan" }))
    expect(await screen.findByRole("heading", { name: "Replace the plan" })).toBeTruthy()
  })

  it("switches to the calendar and shows each session's export links", async () => {
    mock({ "/api/plan": () => json(PLAN), "/api/plan/daily-adapt": () => json({ projected_adaptations: [] }), "/api/calendar": () => json(CAL([day(1)])) })
    render(<Plan />)
    expect(await screen.findByRole("link", { name: /Download .zwo/ })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Summary image" }).getAttribute("href")).toBe("/api/programme/summary/png")
    await userEvent.click(screen.getByRole("button", { name: "Calendar" }))
    expect((await screen.findAllByRole("group")).length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: "Next week" })).toBeNull()
  })
})
