import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { isoDay } from "@/lib/home"
import { PlanTimeOff, problem } from "@/screens/PlanTimeOff"

const addDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return isoDay(d)
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("problem", () => {
  const today = "2026-10-16"
  it("needs both days, not in the past, in order", () => {
    expect(problem({ start: "", end: "" }, today)).toMatch(/Pick/)
    expect(problem({ start: "2026-10-15", end: "2026-10-20" }, today)).toMatch(/past/)
    expect(problem({ start: "2026-10-20", end: "2026-10-19" }, today)).toMatch(/before/)
    expect(problem({ start: "2026-10-16", end: "2026-10-16" }, today)).toBe("")
  })
})

describe("PlanTimeOff", () => {
  const fill = async () => {
    await userEvent.type(screen.getByLabelText("First day"), addDays(2))
    await userEvent.type(screen.getByLabelText("Last day"), addDays(5))
  }

  it("saves the days then rebuilds the plan", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true })))
    vi.stubGlobal("fetch", fetchMock)
    const onDone = vi.fn()
    render(<PlanTimeOff onDone={onDone} onCancel={() => {}} />)
    await fill()
    await userEvent.selectOptions(screen.getByLabelText("Reason"), "injury")
    await userEvent.click(screen.getByRole("button", { name: "Save and rebuild plan" }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect(calls.map((c) => c[0])).toEqual(["/api/plan/mark-unavailable", "/api/plan/regenerate"])
    expect(JSON.parse(calls[0][1].body as string)).toEqual({ start: addDays(2), end: addDays(5), type: "injury", daily_tss: 0 })
  })

  it("does not submit until the days are valid", async () => {
    vi.stubGlobal("fetch", vi.fn())
    render(<PlanTimeOff onDone={() => {}} onCancel={() => {}} />)
    expect((screen.getByRole("button", { name: "Save and rebuild plan" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("says the days are saved when only the rebuild fails, and does not save them twice", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("regenerate") ? new Response(JSON.stringify({ error: "boom" }), { status: 500 }) : new Response(JSON.stringify({ ok: true })),
    )
    vi.stubGlobal("fetch", fetchMock)
    const onDone = vi.fn()
    render(<PlanTimeOff onDone={onDone} onCancel={() => {}} />)
    await fill()
    await userEvent.click(screen.getByRole("button", { name: "Save and rebuild plan" }))
    expect((await screen.findByRole("alert")).textContent).toMatch(/Time off saved, but rebuilding/)
    expect(onDone).not.toHaveBeenCalled()
  })

  it("shows the server's message when saving fails, and does not rebuild", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "No active plan found" }), { status: 404 }))
    vi.stubGlobal("fetch", fetchMock)
    render(<PlanTimeOff onDone={() => {}} onCancel={() => {}} />)
    await fill()
    await userEvent.click(screen.getByRole("button", { name: "Save and rebuild plan" }))
    expect((await screen.findByRole("alert")).textContent).toMatch(/No active plan found/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
