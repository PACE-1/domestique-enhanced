import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { INITIAL, buildPayload, fieldError, toggleDay, toggleRest, type WizardState } from "@/lib/firstRun"
import { Setup } from "@/screens/Setup"

type Call = { url: string; method: string; body?: Record<string, unknown> }

function mockApi(extra: Record<string, () => Response> = {}) {
  const calls: Call[] = []
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (extra[url]) return extra[url]()
      if (url === "/api/setup/ensure-profile") return json({ ok: true })
      if (url === "/api/setup/save") return json({ ok: true })
      if (url === "/api/icu/connection") return json({ method: "none" })
      return json({})
    }),
  )
  return calls
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
  window.history.replaceState({}, "", "/")
})

const touchedState = (patch: Partial<WizardState>): WizardState => ({ ...INITIAL, ...patch })

describe("first-run logic", () => {
  it("validates ranges and the LTHR < max HR rule", () => {
    const v = { ...INITIAL.values, "s-ftp": "900" }
    expect(fieldError("s-ftp", v, {})).toBe("Must be between 50 and 600")
    expect(fieldError("s-ftp", v, { ftp: [50, 1000] })).toBe("")
    const hr = { ...INITIAL.values, "s-lthr": "190", "s-maxhr": "180" }
    expect(fieldError("s-lthr", hr, {})).toBe("LTHR (190) must be below max HR (180)")
    expect(fieldError("s-age", INITIAL.values, {})).toBe("")
  })

  it("sends only touched fields, with the ICU hint for an auto-filled LTHR", () => {
    expect(buildPayload(INITIAL)).toEqual({})
    const s = touchedState({
      touched: ["s-ftp", "s-lthr", "s-hours"],
      icuOrigin: ["s-lthr"],
      values: { ...INITIAL.values, "s-ftp": "260", "s-lthr": "168", "s-hours": "7.5" },
      targetMode: "hr",
      targetModeTouched: true,
    })
    expect(buildPayload(s)).toEqual({
      ftp: 260, lthr: 168, lthr_source_hint: "icu", target_mode: "hr", hours_per_week: 7.5,
    })
  })

  it("a day cannot be both training and rest", () => {
    const afterDay = toggleDay(INITIAL, "0") // Mon is the default rest day
    expect(afterDay.days).toContain("0")
    expect(afterDay.rest).not.toContain("0")
    expect(afterDay.daysTouched && afterDay.restTouched).toBe(true)
    const afterRest = toggleRest(INITIAL, "3")
    expect(afterRest.rest).toContain("3")
    expect(afterRest.days).not.toContain("3")
    expect(buildPayload(afterRest)).toMatchObject({ available_days: [1, 2, 4, 5, 6], rest_days: [0, 3] })
  })
})

describe("Setup wizard", () => {
  it("walks the four steps and saves only what was touched, after ensure-profile", async () => {
    const calls = mockApi()
    render(<Setup />)
    await userEvent.click(await screen.findByRole("button", { name: "Continue without intervals.icu" }))
    const ftp = await screen.findByLabelText(/FTP — Functional Threshold Power/)
    await userEvent.clear(ftp)
    await userEvent.type(ftp, "265")
    await userEvent.click(screen.getByRole("button", { name: "Next" }))
    await userEvent.click(await screen.findByRole("button", { name: "Next" }))
    await userEvent.click(await screen.findByRole("button", { name: "Complete Setup" }))
    await waitFor(() => expect(calls.some((c) => c.url === "/api/setup/save")).toBe(true))

    const writes = calls.filter((c) => c.method === "POST").map((c) => c.url)
    expect(writes).toEqual(["/api/setup/ensure-profile", "/api/setup/save"])
    expect(calls.find((c) => c.url === "/api/setup/save")?.body).toEqual({ ftp: 265 })
    expect(localStorage.getItem("domestique_setup")).toBeNull()
  })

  it("blocks Next on an out-of-range value", async () => {
    mockApi()
    render(<Setup />)
    await userEvent.click(await screen.findByRole("button", { name: "Continue without intervals.icu" }))
    const ftp = await screen.findByLabelText(/FTP — Functional Threshold Power/)
    await userEvent.clear(ftp)
    await userEvent.type(ftp, "9000")
    expect(await screen.findByText("Must be between 50 and 600")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("restores a rider's earlier entries from localStorage", async () => {
    mockApi()
    localStorage.setItem("domestique_setup", JSON.stringify({ "s-ftp": "301", touched: ["s-ftp"] }))
    render(<Setup />)
    await userEvent.click(await screen.findByRole("button", { name: "Continue without intervals.icu" }))
    await waitFor(() =>
      expect((screen.getByLabelText(/FTP — Functional Threshold Power/) as HTMLInputElement).value).toBe("301"),
    )
  })

  it("explains an intervals.icu failure on return", async () => {
    mockApi()
    window.history.replaceState({}, "", "/v2/?wizard=setup&icu=error&reason=exchange")
    render(<Setup />)
    expect(await screen.findByText(/intervals.icu rejected the sign-in code/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
  })
})
