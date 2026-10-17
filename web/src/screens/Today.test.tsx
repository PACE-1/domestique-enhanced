import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DailyCheckIn } from "@/screens/DailyCheckIn"
import { Readiness } from "@/screens/Readiness"

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
type Handler = (body: unknown) => Response
function mock(routes: Record<string, Handler>) {
  const calls: { url: string; body: unknown }[] = []
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined
    calls.push({ url, body })
    return (routes[url] ?? (() => json({}, 404)))(body)
  }))
  return calls
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const planned = { session_type: "threshold", duration_min: 60, tss_estimate: 70, description: "" }
const adjusted = { session_type: "z2", duration_min: 60, tss_estimate: 40, description: "" }

describe("Readiness", () => {
  it("shows the verdict and reason", async () => {
    mock({
      "/api/readiness": () => json({ severity: "normal", score_0_100: 82.4, severity_reasons: ["HRV is in range"] }),
      "/api/today-session": () => json({ planned, adjusted: planned, was_modified: false }),
    })
    render(<Readiness />)
    expect(await screen.findByText("Ready to train")).toBeTruthy()
    expect(screen.getByText(/82\/100/)).toBeTruthy()
    expect(screen.getByText("HRV is in range")).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("accepts the suggested session, and can ride the original instead", async () => {
    const calls = mock({
      "/api/readiness": () => json({ severity: "tier_down", score_0_100: 40, severity_reasons: [] }),
      "/api/today-session": () => json({ planned, adjusted, was_modified: true, reason: "low HRV" }),
      "/api/today-session/persist": () => json({ ok: true }),
      "/api/readiness/revert-cap": () => json({ ok: true }),
    })
    render(<Readiness />)
    await userEvent.click(await screen.findByRole("button", { name: "Use the suggestion" }))
    await waitFor(() => expect(calls.some((c) => c.url === "/api/today-session/persist")).toBe(true))
    expect(calls.find((c) => c.url === "/api/today-session/persist")!.body).toMatchObject({ session_type: "z2", reason: "low HRV" })
    await userEvent.click(await screen.findByRole("button", { name: "Ride the original" }))
    await waitFor(() => expect(calls.some((c) => c.url === "/api/readiness/revert-cap")).toBe(true))
  })

  it("eases today's session and reports a refusal in words", async () => {
    mock({
      "/api/readiness": () => json({ severity: "tier_down", score_0_100: 40, severity_reasons: [] }),
      "/api/today-session": () => json({ planned: null, adjusted: null }),
      "/api/readiness/apply-tier-down": () => json({ ok: false, action: "already_easy" }),
    })
    render(<Readiness />)
    await userEvent.click(await screen.findByRole("button", { name: "Ease today’s session" }))
    expect((await screen.findByRole("status")).textContent).toContain("already easy")
  })

  it("previews the week adjustment and saves only on confirm", async () => {
    const calls = mock({
      "/api/readiness": () => json({ severity: "tier_down", score_0_100: 40, severity_reasons: [] }),
      "/api/today-session": () => json({ planned: null, adjusted: null }),
      "/api/plan/auto-adjust": (b) =>
        (b as { dry_run: boolean }).dry_run
          ? json({ ok: true, dry_run: true, actions: [{ day: "2026-10-20", after: { type: "z2" } }], sessions_modified: 1 })
          : json({ ok: true, dry_run: false, actions: [], sessions_modified: 1 }),
    })
    render(<Readiness />)
    await userEvent.click(await screen.findByRole("button", { name: "Adjust this week…" }))
    expect(await screen.findByText(/2026-10-20 → z2/)).toBeTruthy()
    expect(calls.filter((c) => c.url === "/api/plan/auto-adjust")).toHaveLength(1)
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }))
    await waitFor(() => expect(calls.filter((c) => c.url === "/api/plan/auto-adjust")).toHaveLength(2))
    const [preview, commit] = calls.filter((c) => c.url === "/api/plan/auto-adjust").map((c) => c.body)
    expect(preview).toEqual({ scope: "week", dry_run: true, severity: "tier_down" })
    expect(commit).toEqual({ scope: "week", dry_run: false, severity: "tier_down" })
  })

  it("uses the next-day scope for a rest recommendation", async () => {
    const calls = mock({
      "/api/readiness": () => json({ severity: "rest", score_0_100: 20, severity_reasons: [] }),
      "/api/today-session": () => json({ planned: null, adjusted: null }),
      "/api/plan/auto-adjust": () => json({ ok: true, actions: [], sessions_modified: 0 }),
    })
    render(<Readiness />)
    await userEvent.click(await screen.findByRole("button", { name: "Apply rest day…" }))
    await screen.findByText("No sessions would change.")
    expect(calls.find((c) => c.url === "/api/plan/auto-adjust")!.body).toEqual({ scope: "day", dry_run: true, severity: "rest" })
  })

  it("keeps working when only the today-session read fails", async () => {
    mock({ "/api/readiness": () => json({ severity: "normal", score_0_100: 70, severity_reasons: [] }) })
    render(<Readiness />)
    expect(await screen.findByText("Ready to train")).toBeTruthy()
  })
})

describe("DailyCheckIn", () => {
  it("saves a check-in, then shows it was logged", async () => {
    let logged = false
    const calls = mock({
      "/api/daily-log": (b) => {
        if (b) { logged = true; return json({ ok: true, entry: { date: "d" } }) }
        return json({ today: logged ? { date: "d", sleep_quality: 4, fatigue: 3, stress: 4, soreness: 5, mood: 4 } : null, history: [] })
      },
    })
    render(<DailyCheckIn />)
    await userEvent.selectOptions(await screen.findByLabelText("Fatigue"), "2")
    await userEvent.click(screen.getByRole("button", { name: "Save check-in" }))
    expect(await screen.findByText(/wellness 3.0 \/ 5/)).toBeTruthy()
    expect(calls.find((c) => c.body)!.body).toEqual({ sleep_quality: 4, fatigue: 5, stress: 4, soreness: 4, mood: 4 })
  })

  it("shows the server's message when the save is refused", async () => {
    mock({ "/api/daily-log": (b) => (b ? json({ error: "fatigue must be 1..7" }, 400) : json({ today: null, history: [] })) })
    render(<DailyCheckIn />)
    await userEvent.click(await screen.findByRole("button", { name: "Save check-in" }))
    expect((await screen.findByRole("alert")).textContent).toContain("fatigue must be 1..7")
  })
})

describe("check-in scale", () => {
  it("maps the 1 to 5 rating onto the Hooper 1 to 7 scale and back, keeping both ends", async () => {
    const { rateToHooper, hooperToRate } = await import("@/lib/home")
    expect([5, 4, 3, 2, 1].map(rateToHooper)).toEqual([1, 3, 4, 5, 7])
    expect([1, 2, 3, 4, 5, 6, 7].map(hooperToRate)).toEqual([5, 4, 4, 3, 2, 2, 1])
    for (const r of [1, 2, 3, 4, 5]) expect(hooperToRate(rateToHooper(r))).toBe(r)
  })
})
