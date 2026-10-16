import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { r2Quality, type DfaRides } from "@/lib/dfa"
import { Dfa } from "@/screens/Dfa"

const WITH_THRESHOLDS: DfaRides = {
  n_total: 2,
  n_computed: 2,
  aggregate: {
    agg_min_r2: 0.5,
    n_excluded_decoupling: 1,
    hrvt1: { hr: 142.4, power: 160, r2_hr_median: 0.71, r2_power_median: 0.66, n_hr: 4, n_power: 3, date_span: ["2026-09-01", "2026-10-01"] },
    hrvt2: { hr: 165, power: 230, r2_hr_median: 0.52, r2_power_median: 0.5, n_hr: 2, n_power: 2 },
  },
  rides: [
    {
      id: "123", date: "2026-10-01", name: "Ramp", duration_min: 45, avg_hr: 150, alpha1_avg: 0.62,
      zone_minutes: { z1: 10, z2: 20, z3: 5 },
      hrvt1: { hr: 140, power: 158, r2_hr: 0.7, r2_power: 0.4 },
      hrvt2: null, hrvt2_note: "not crossed",
    },
  ],
}

function mockApi(rides: DfaRides | number, over: Record<string, () => Response> = {}) {
  const calls: { url: string; method: string }[] = []
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET" })
      if (over[url]) return over[url]()
      if (url === "/api/profile/dfa-rides") return typeof rides === "number" ? json({}, rides) : json(rides)
      if (url.startsWith("/api/profile/dfa-backfill/status")) return json({ state: "done", computed: 0, candidates: 0 })
      if (url.startsWith("/api/profile/dfa-backfill")) return json({ task_id: "t1" })
      if (url === "/api/sync/progress") return json({ state: "done" })
      return json({})
    }),
  )
  return calls
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe("r2Quality", () => {
  it("matches the legacy thresholds", () => {
    expect(r2Quality(0.6).label).toBe("good")
    expect(r2Quality(0.45).label).toBe("moderate")
    expect(r2Quality(0.44).label).toBe("low")
    expect(r2Quality(null).label).toBe("")
  })
})

describe("Dfa tab", () => {
  it("shows aggregate thresholds and the three-zone power model", async () => {
    mockApi(WITH_THRESHOLDS)
    render(<Dfa />)
    expect(await screen.findByText("Aerobic threshold (HRVT1)")).toBeTruthy()
    expect(screen.getByText("142 bpm")).toBeTruthy()
    expect(screen.getByText("230 W")).toBeTruthy()
    expect(screen.getByText(/\(1 dropped\)/)).toBeTruthy()
    expect(screen.getByText("Z2 Moderate").nextSibling?.textContent).toBe("160 W – 230 W")
  })

  it("explains when no threshold was crossed", async () => {
    mockApi({ n_total: 3, n_computed: 3, aggregate: {}, rides: [] })
    render(<Dfa />)
    expect(await screen.findByText("No thresholds detected yet.")).toBeTruthy()
    expect(screen.getByText(/3 ride\(s\) have α1 computed/)).toBeTruthy()
  })

  it("per-ride view lists rides with quality-labelled thresholds", async () => {
    mockApi(WITH_THRESHOLDS)
    render(<Dfa />)
    await userEvent.click(await screen.findByRole("button", { name: "Per-ride" }))
    expect(await screen.findByText("Ramp")).toBeTruthy()
    expect(screen.getByText("0.62")).toBeTruthy()
    expect(screen.getByText(/r²0.70 good/)).toBeTruthy()
    expect(screen.getByText(/r²0.40 low/)).toBeTruthy()
    expect(screen.getByText("not crossed")).toBeTruthy()
  })

  it("upgrades stale rides with the migrate flag instead of a plain backfill", async () => {
    const calls = mockApi({ ...WITH_THRESHOLDS, n_stale_version: 2 })
    render(<Dfa />)
    await waitFor(() =>
      expect(calls.some((c) => c.url === "/api/profile/dfa-backfill?migrate=1" && c.method === "POST")).toBe(true),
    )
    expect(calls.some((c) => c.url === "/api/profile/dfa-backfill" && c.method === "POST")).toBe(false)
    expect(localStorage.getItem("dfa_migrate_last_run_at:")).not.toBeNull()
  })

  it("starts a plain backfill when nothing is stale", async () => {
    const calls = mockApi(WITH_THRESHOLDS)
    render(<Dfa />)
    await waitFor(() => expect(calls.some((c) => c.url === "/api/profile/dfa-backfill" && c.method === "POST")).toBe(true))
  })

  it("reports a load failure", async () => {
    mockApi(500)
    render(<Dfa />)
    expect(await screen.findByText("Failed to load DFA data (500)")).toBeTruthy()
  })
})
