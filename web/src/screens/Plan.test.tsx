import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { isoDay } from "@/lib/home"
import { Plan } from "@/screens/Plan"

const addDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return isoDay(d)
}
const session = (day: string, over = {}) => ({
  day, day_name: "", session_type: "z2", duration_min: 90, tss_estimate: 60, description: "", zwo_name: "", status: "pending", ...over,
})
const week = (n: number, startOffset: number, over = {}) => ({
  week_num: n, start: addDays(startOffset), end: addDays(startOffset + 6), phase: "base", tss_target: 300, is_stepback: false,
  sessions: [session(addDays(startOffset + 1), { zwo_name: `Ride ${n}` })], ...over,
})
const PLAN = {
  plan_json: {
    goal: { type: "ftp", hours_per_week: 8, event_name: "", event_date: null },
    phases: [{ name: "base", weeks: 2 }, { name: "build1", weeks: 1 }],
    weeks: [week(1, -9), week(2, -2), week(3, 5, { is_stepback: true, phase: "build1" })],
  },
}

function mockPlan(res: () => Response) {
  vi.stubGlobal("fetch", vi.fn(async () => res()))
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("Plan", () => {
  it("opens on the week that contains today and shows its sessions and load", async () => {
    mockPlan(() => new Response(JSON.stringify(PLAN)))
    render(<Plan />)
    expect(await screen.findByText(/Week 2 · base/)).toBeTruthy()
    expect(screen.getByText(/Ride 2/)).toBeTruthy()
    expect(screen.getByText(/60 of 300 TSS planned/)).toBeTruthy()
    expect(screen.getByText(/base \(2 wk\) → build1 \(1 wk\)/)).toBeTruthy()
  })

  it("moves between weeks and marks a recovery week", async () => {
    mockPlan(() => new Response(JSON.stringify(PLAN)))
    render(<Plan />)
    await screen.findByText(/Week 2/)
    await userEvent.click(screen.getByRole("button", { name: "Next week" }))
    expect(await screen.findByText(/Week 3 · build1 · recovery/)).toBeTruthy()
    expect((screen.getByRole("button", { name: "Next week" }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(screen.getByRole("button", { name: "Previous week" }))
    await userEvent.click(screen.getByRole("button", { name: "Previous week" }))
    expect(await screen.findByText(/Week 1/)).toBeTruthy()
    expect((screen.getByRole("button", { name: "Previous week" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("says so when there is no plan", async () => {
    mockPlan(() => new Response(JSON.stringify({ plan_json: { goal: {}, phases: [], weeks: [] } })))
    render(<Plan />)
    expect(await screen.findByText("No training plan yet.")).toBeTruthy()
  })

  it("shows the error and retries", async () => {
    let fail = true
    mockPlan(() => (fail ? new Response(JSON.stringify({ error: "down" }), { status: 500 }) : new Response(JSON.stringify(PLAN))))
    render(<Plan />)
    expect((await screen.findByRole("alert")).textContent).toContain("down")
    fail = false
    await userEvent.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(screen.getByText(/Week 2/)).toBeTruthy())
  })

  it("dismisses a session, re-reads the plan, and can restore it", async () => {
    const posts: unknown[] = []
    let dismissed = false
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/plan/dismiss-session") {
        const body = JSON.parse(String(init?.body))
        posts.push(body)
        dismissed = !body.undo
        return new Response(JSON.stringify({ ok: true, dismissed }))
      }
      const copy = JSON.parse(JSON.stringify(PLAN))
      if (dismissed) copy.plan_json.weeks[1].sessions[0].status = "dismissed"
      return new Response(JSON.stringify(copy))
    }))
    render(<Plan />)
    const day = PLAN.plan_json.weeks[1].sessions[0].day
    await userEvent.click(await screen.findByRole("button", { name: /^Dismiss / }))
    expect(await screen.findByRole("button", { name: /^Restore / })).toBeTruthy()
    expect(posts[0]).toEqual({ date: day, undo: false })
    await userEvent.click(screen.getByRole("button", { name: /^Restore / }))
    await screen.findByRole("button", { name: /^Dismiss / })
    expect(posts[1]).toEqual({ date: day, undo: true })
  })

  it("shows the server's message when a change fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url === "/api/plan/dismiss-session"
        ? new Response(JSON.stringify({ error: "race day is fixed" }), { status: 400 })
        : new Response(JSON.stringify(PLAN))))
    render(<Plan />)
    await userEvent.click(await screen.findByRole("button", { name: /^Dismiss / }))
    expect((await screen.findByRole("alert")).textContent).toContain("race day is fixed")
  })

  it("moves a session to a chosen day and re-reads the plan", async () => {
    const posts: unknown[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/plan/move-session") {
        posts.push(JSON.parse(String(init?.body)))
        return new Response(JSON.stringify({ ok: true, moved: {}, vacated: null, swapped: null }))
      }
      return new Response(JSON.stringify(PLAN))
    }))
    render(<Plan />)
    const day = PLAN.plan_json.weeks[1].sessions[0].day
    const target = addDays(3)
    await userEvent.click(await screen.findByRole("button", { name: /^Move / }))
    const input = screen.getByLabelText("Move to") as HTMLInputElement
    expect((screen.getByRole("button", { name: "Move here" }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.type(input, target)
    await userEvent.click(screen.getByRole("button", { name: "Move here" }))
    await waitFor(() => expect(posts).toEqual([{ date: day, new_date: target }]))
    await waitFor(() => expect(screen.queryByLabelText("Move to")).toBeNull())
  })

  it("keeps the move open and shows the refusal when the server says no", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url === "/api/plan/move-session"
        ? new Response(JSON.stringify({ error: "That day is already ridden" }), { status: 409 })
        : new Response(JSON.stringify(PLAN))))
    render(<Plan />)
    await userEvent.click(await screen.findByRole("button", { name: /^Move / }))
    await userEvent.type(screen.getByLabelText("Move to"), addDays(3))
    await userEvent.click(screen.getByRole("button", { name: "Move here" }))
    expect((await screen.findByRole("alert")).textContent).toContain("already ridden")
    expect(screen.getByLabelText("Move to")).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByLabelText("Move to")).toBeNull()
  })

  it("changes a session's type and length and re-reads the plan", async () => {
    const posts: unknown[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/plan/swap-type") {
        posts.push(JSON.parse(String(init?.body)))
        return new Response(JSON.stringify({ ok: true, day: "", session_type: "vo2max", duration_min: 60, tss_estimate: 70 }))
      }
      return new Response(JSON.stringify(PLAN))
    }))
    render(<Plan />)
    const day = PLAN.plan_json.weeks[1].sessions[0].day
    await userEvent.click(await screen.findByRole("button", { name: /^Change type / }))
    await userEvent.selectOptions(screen.getByLabelText("New type"), "vo2max")
    const minutes = screen.getByLabelText("Minutes")
    await userEvent.clear(minutes)
    await userEvent.type(minutes, "60")
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))
    await waitFor(() => expect(posts).toEqual([{ date: day, session_type: "vo2max", duration_min: 60 }]))
    await waitFor(() => expect(screen.queryByLabelText("New type")).toBeNull())
  })

  it("keeps the type picker open and shows the server's message on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url === "/api/plan/swap-type"
        ? new Response(JSON.stringify({ error: "Unknown session_type: x" }), { status: 400 })
        : new Response(JSON.stringify(PLAN))))
    render(<Plan />)
    await userEvent.click(await screen.findByRole("button", { name: /^Change type / }))
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))
    expect((await screen.findByRole("alert")).textContent).toContain("Unknown session_type")
    expect(screen.getByLabelText("New type")).toBeTruthy()
  })
})
