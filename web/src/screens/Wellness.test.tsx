import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BodyPerf } from "@/screens/BodyPerf"
import { EnergySystems } from "@/screens/EnergySystems"
import { FtpHistory } from "@/screens/FtpHistory"
import { GoalEvent } from "@/screens/GoalEvent"
import { Hrv } from "@/screens/Hrv"
import { Notices } from "@/screens/Notices"
import { RetestNudge } from "@/screens/RetestNudge"

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
type Handler = (body: unknown) => Response
function mock(routes: Record<string, Handler>) {
  const calls: { url: string; method?: string; body: unknown }[] = []
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const raw = init?.body
    const body = typeof raw === "string" ? JSON.parse(raw) : raw
    calls.push({ url, method: init?.method, body })
    const key = Object.keys(routes).find((k) => url.startsWith(k))
    return key ? routes[key](body) : json({}, 404)
  }))
  return calls
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

describe("Hrv", () => {
  it("saves a manual reading, validating the range first", async () => {
    const calls = mock({
      "/api/wellness/hrv-recording-status": () => json({ should_show_prompt: false }),
      "/api/wellness/manual-hrv": () => json({ ok: true, date: "2026-10-16", hrv_manual_rmssd: 62 }),
    })
    render(<Hrv />)
    const input = screen.getByLabelText(/Today’s rMSSD/)
    await userEvent.type(input, "400")
    expect(screen.getByText(/at most 250/)).toBeTruthy()
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.clear(input)
    await userEvent.type(input, "62")
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    expect((await screen.findByRole("status")).textContent).toContain("Saved 62 ms for 2026-10-16")
    expect(calls.find((c) => c.url === "/api/wellness/manual-hrv")!.body).toEqual({ rmssd: 62 })
  })

  it("imports a CSV and reports skipped rows, or the server's refusal", async () => {
    let fail = false
    const calls = mock({
      "/api/wellness/hrv-recording-status": () => json({ should_show_prompt: false }),
      "/api/wellness/import-hrv4training": () => (fail ? json({ detail: "HRV CSV is over the 5 MB limit" }, 413) : json({ imported: 30, skipped: 2 })),
    })
    render(<Hrv />)
    const file = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(file, new File(["date,rmssd"], "h.csv"))
    await userEvent.click(screen.getByRole("button", { name: "Import CSV" }))
    expect((await screen.findByRole("status")).textContent).toContain("Imported 30 days, skipped 2 rows")
    expect((calls.find((c) => c.url.includes("import-hrv"))!.body as FormData).get("file")).toBeTruthy()
    fail = true
    await userEvent.upload(file, new File(["x"], "big.csv"))
    await userEvent.click(screen.getByRole("button", { name: "Import CSV" }))
    expect((await screen.findByRole("alert")).textContent).toContain("5 MB limit")
  })

  it("shows the no-HRV-recording prompt and dismisses it", async () => {
    let show = true
    const calls = mock({
      "/api/wellness/hrv-recording-status": () => json({ should_show_prompt: show, device_product_name: "Edge 540" }),
      "/api/wellness/hrv-recording-dismiss": () => { show = false; return json({ ok: true }) },
    })
    render(<Hrv />)
    expect(await screen.findByText(/on your Edge 540 had no HRV data/)).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "Don’t show again" }))
    await waitFor(() => expect(screen.queryByText(/had no HRV data/)).toBeNull())
    expect(calls.find((c) => c.url.endsWith("dismiss"))!.body).toEqual({ level: "permanent" })
  })
})

describe("RetestNudge", () => {
  it("schedules an FTP test on the suggested day, once", async () => {
    const calls = mock({ "/api/plan/swap-type": () => json({ ok: true }) })
    render(<RetestNudge n={{ metric: "ftp", reason: "Your FTP is from an estimate.", days_since: 120, action: "insert_ftp_test", suggested_date: "2026-10-20", snooze_days: 7 }} />)
    await userEvent.click(screen.getByRole("button", { name: "Schedule a test on 2026-10-20" }))
    expect((await screen.findByRole("status")).textContent).toContain("FTP test added on 2026-10-20")
    expect(calls[0].body).toEqual({ date: "2026-10-20", session_type: "ftp_test", duration_min: 60 })
    expect((screen.getByRole("button", { name: "Snooze 7 days" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("snoozes, and explains the LTHR test for heart-rate mode", async () => {
    const calls = mock({ "/api/retest-nudge/snooze": () => json({ ok: true, until: "2026-10-23" }) })
    render(<RetestNudge n={{ metric: "lthr", reason: "Old.", action: "lthr_instructions", snooze_days: 7 }} />)
    await userEvent.click(screen.getByRole("button", { name: "How to test LTHR" }))
    expect(screen.getByText(/ride 20 minutes/)).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "Snooze 7 days" }))
    expect((await screen.findByRole("status")).textContent).toContain("2026-10-23")
    expect(calls[0].url).toBe("/api/retest-nudge/snooze")
  })
})

describe("GoalEvent", () => {
  it("shows the event and the prediction, and nothing when there is no event", async () => {
    mock({ "/api/event/projection": () => json({ available: true, event_name: "Gran Fondo", event_date: "2099-06-01", event_km: 120, event_climb_m: 2000, predicted_finish_h: 4.5, predicted_np: 205.4, predicted_tss: 310, climb_readiness_pct: 82, gap_endurance_h: 0.5, longest_required_h: 4 }) })
    const { unmount } = render(<GoalEvent />)
    expect(await screen.findByText("Gran Fondo")).toBeTruthy()
    expect(screen.getByText("4 h 30 min")).toBeTruthy()
    expect(screen.getByText("205 W")).toBeTruthy()
    unmount()
    mock({ "/api/event/projection": () => json({ available: false, reason: "not_event_goal" }) })
    const { container } = render(<GoalEvent />)
    await waitFor(() => expect(container.textContent).toBe(""))
  })
})

describe("FtpHistory", () => {
  const H = { ftp_current: 262, ftp_source: "tested_ramp", history: [{ date: "2026-08-01", ftp: 250, type: "manual", applied: true }, { date: "2026-10-01", ftp: 262, type: "tested_ramp", applied: true }, { date: "2026-10-05", ftp: 270, type: "tested_coggan_20min", applied: false }] }
  it("lists the changes with their source and sets a new FTP", async () => {
    const calls = mock({ "/api/profile/ftp-history": () => json(H), "/api/profile/update-ftp": () => json({ ok: true, ftp: 265 }) })
    render(<FtpHistory />)
    expect(await screen.findByText((_, el) => el?.tagName === "P" && (el.textContent ?? "").includes("Current FTP 262 W"))).toBeTruthy()
    expect(screen.getByText("20-minute test (not applied)")).toBeTruthy()
    expect(screen.getByRole("img", { name: /FTP over 2 changes/ })).toBeTruthy()
    await userEvent.type(screen.getByLabelText("Set FTP (W)"), "9000")
    expect(screen.getByText("FTP must be between 50 and 600 W.")).toBeTruthy()
    await userEvent.clear(screen.getByLabelText("Set FTP (W)"))
    await userEvent.type(screen.getByLabelText("Set FTP (W)"), "265")
    await userEvent.click(screen.getByRole("button", { name: "Set FTP" }))
    expect((await screen.findByRole("status")).textContent).toContain("FTP is now 265 W")
    expect(calls.find((c) => c.url === "/api/profile/update-ftp")!.body).toEqual({ ftp: 265, method: "manual", source: "manual", applied: true })
  })
})

describe("BodyPerf", () => {
  it("shows the latest value of each metric, or says there is no history", async () => {
    mock({ "/api/metrics/history?metric=weight": () => json([{ date: "d1", value: 70 }, { date: "d2", value: 69.4 }]), "/api/metrics/history?metric=ftp": () => json([{ date: "d", value: 250 }]), "/api/metrics/history": () => json([]) })
    const { unmount } = render(<BodyPerf />)
    expect(await screen.findByText("69.4 kg")).toBeTruthy()
    expect(screen.getByText("250 W")).toBeTruthy()
    expect(screen.getByRole("img", { name: "Weight trend" })).toBeTruthy()
    unmount()
    mock({ "/api/metrics/history": () => json([]) })
    render(<BodyPerf />)
    expect(await screen.findByText(/No history yet/)).toBeTruthy()
  })
})

describe("EnergySystems", () => {
  it("charts what exists and offers the backfill only when rides are missing", async () => {
    const rows = [0, 1, 2].map((i) => ({ date: `d${i}`, cp_fitness: 200 + i, w_prime_fitness: null }))
    const calls = mock({
      "/api/wellness/3d-fitness-status": () => json({ rides_with_ss: 3, rides_total_post_v106: 5 }),
      "/api/wellness/backfill-3d-fitness": () => json({ backfilled: 2, skipped: 0, failed: 0, results: [] }),
      "/api/wellness?": () => json(rows),
    })
    render(<EnergySystems />)
    expect(await screen.findByRole("img", { name: /Aerobic \(critical power fitness\) over the last 3 days/ })).toBeTruthy()
    expect(screen.queryByRole("img", { name: /Anaerobic/ })).toBeNull()
    expect(screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "3 of 5 rides have energy-system data.")).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "Fill in the missing rides" }))
    expect((await screen.findByRole("status")).textContent).toContain("2 rides processed")
    expect(calls.some((c) => c.url === "/api/wellness/backfill-3d-fitness" && c.method === "POST")).toBe(true)
  })
})

describe("Notices", () => {
  it("says the app was updated and that a newer release exists, and remembers a dismissal", async () => {
    mock({
      "/api/migrations/last-run-result": () => json({ show_toast: true, from_version: "0.9", to_version: "1.0.0" }),
      "/api/update/check": () => json({ current: "1.0.0", latest: "1.1.0", update_available: true, release_url: "https://example.test/r" }),
    })
    const { unmount } = render(<Notices />)
    expect(await screen.findByText(/Updated from 0.9 to 1.0.0/)).toBeTruthy()
    expect(screen.getByText(/Version 1.1.0 is available/)).toBeTruthy()
    await userEvent.click(screen.getAllByRole("button", { name: "Dismiss" })[0])
    expect(screen.queryByText(/Updated from/)).toBeNull()
    unmount()
    mock({ "/api/migrations/last-run-result": () => json({ show_toast: true, from_version: "0.9", to_version: "1.0.0" }), "/api/update/check": () => json({ current: "1.0.0", update_available: false }) })
    const { container } = render(<Notices />)
    await waitFor(() => expect(container.textContent).toBe(""))
  })

  it("stays silent when both calls fail", async () => {
    mock({})
    const { container } = render(<Notices />)
    await new Promise((r) => setTimeout(r, 50))
    expect(container.textContent).toBe("")
  })
})
