import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { PlanGenerate, problem } from "@/screens/PlanGenerate"

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("problem", () => {
  const ok = { hours: 8, weeks: 12, goal: "general", eventDate: "" }
  it("accepts a normal request", () => expect(problem(ok, "2026-10-16")).toBe(""))
  it("bounds hours and weeks", () => {
    expect(problem({ ...ok, hours: 0 }, "2026-10-16")).toMatch(/Hours/)
    expect(problem({ ...ok, hours: 41 }, "2026-10-16")).toMatch(/Hours/)
    expect(problem({ ...ok, weeks: 3 }, "2026-10-16")).toMatch(/length/)
    expect(problem({ ...ok, weeks: 53 }, "2026-10-16")).toMatch(/length/)
  })
  it("needs a future date for an event", () => {
    expect(problem({ ...ok, goal: "event" }, "2026-10-16")).toMatch(/Pick/)
    expect(problem({ ...ok, goal: "event", eventDate: "2026-10-16" }, "2026-10-16")).toMatch(/future/)
    expect(problem({ ...ok, goal: "event", eventDate: "2026-12-01" }, "2026-10-16")).toBe("")
  })
})

describe("PlanGenerate", () => {
  it("posts the form and calls onDone", async () => {
    const posts: unknown[] = []
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      posts.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({ plan_json: { weeks: [] } }))
    }))
    const done = vi.fn()
    render(<PlanGenerate hasPlan={false} onDone={done} />)
    await userEvent.selectOptions(screen.getByLabelText("Goal"), "ftp")
    const hours = screen.getByLabelText("Hours per week")
    await userEvent.clear(hours)
    await userEvent.type(hours, "10")
    await userEvent.click(screen.getByLabelText("Sun"))
    await userEvent.click(screen.getByRole("button", { name: "Create plan" }))
    await waitFor(() => expect(done).toHaveBeenCalled())
    expect(posts).toEqual([{ goal: "ftp", hours_per_week: 10, plan_weeks: 12, rest_days: [0, 6] }])
  })

  it("asks for the event fields and sends them", async () => {
    const posts: Record<string, unknown>[] = []
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      posts.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({}))
    }))
    render(<PlanGenerate hasPlan onDone={() => {}} />)
    expect(screen.getByText(/replaces the current plan/)).toBeTruthy()
    await userEvent.selectOptions(screen.getByLabelText("Goal"), "event")
    expect((screen.getByRole("button", { name: "Replace plan" }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.type(screen.getByLabelText("Event name"), "Gran Fondo")
    await userEvent.type(screen.getByLabelText("Event date"), "2099-06-01")
    await userEvent.click(screen.getByRole("button", { name: "Replace plan" }))
    await waitFor(() => expect(posts.length).toBe(1))
    expect(posts[0]).toMatchObject({ goal: "event", event_name: "Gran Fondo", event_date: "2099-06-01" })
  })

  it("shows the server's message and does not call onDone when it fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "bad goal" }), { status: 400 })))
    const done = vi.fn()
    render(<PlanGenerate hasPlan={false} onDone={done} />)
    await userEvent.click(screen.getByRole("button", { name: "Create plan" }))
    expect((await screen.findByRole("alert")).textContent).toContain("bad goal")
    expect(done).not.toHaveBeenCalled()
  })
})
