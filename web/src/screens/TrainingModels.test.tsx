import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BanisterCard, FatigueCard, TauFitsCard } from "@/screens/TrainingModels"

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function mock(routes: Record<string, unknown>) {
  const urls: string[] = []
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    urls.push(url)
    const key = Object.keys(routes).find((k) => url.startsWith(k))
    return key ? json(routes[key]) : json({}, 404)
  }))
  return urls
}

describe("training models", () => {
  it("says what is missing for a personal time-constant fit", async () => {
    mock({ "/api/profile/tau-fits": { fit_status: "insufficient_data", n_markers: 2, weighted_n: 1.6 } })
    render(<TauFitsCard />)
    expect(await screen.findByText(/You have 1.6 from 2 FTP estimates/)).toBeTruthy()
  })

  it("shows the fitted values next to the usual ones", async () => {
    mock({ "/api/profile/tau-fits": { fit_status: "success", n_markers: 9, weighted_n: 7, ctl_tau_fit: 38.2, ctl_tau_ci_low: 30, ctl_tau_ci_high: 46, atl_tau_fit: 6.1, fit_residual_r2: 0.71, conventional: { ctl_tau: 42, atl_tau: 7 } } })
    render(<TauFitsCard />)
    expect(await screen.findByText(/38.2 \(30.0–46.0\) \/ 42.0/)).toBeTruthy()
    expect(screen.getByText(/Fit accepted/)).toBeTruthy()
  })

  it("only computes the model check on request, and recomputes with refresh", async () => {
    const urls = mock({ "/api/profile/banister-validation": { fit_status: "success", comparison: "in_line", ftp_mae_pct: 5.4, ftp_mae_w: 13.2, ftp_mae_pct_ci_low: 3, ftp_mae_pct_ci_high: 8, ctl_mae_tss: 4 } })
    render(<BanisterCard />)
    expect(urls).toHaveLength(0)
    await userEvent.click(screen.getByRole("button", { name: "Check the model" }))
    expect(await screen.findByText(/About 5.4% error on FTP \(3.0–8.0%\), or 13.2 W/)).toBeTruthy()
    expect(screen.getByText(/In line with published models/)).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "Recompute" }))
    await waitFor(() => expect(urls.some((u) => u.endsWith("?refresh=1"))).toBe(true))
  })

  it("explains why fatigue resistance is unavailable and switches the threshold", async () => {
    const urls = mock({ "/api/profile/fatigue-resistance": { fit_status: "insufficient_data", reason: "no_rides_in_window", n_long_rides: 0 } })
    render(<FatigueCard />)
    expect(await screen.findByText(/No rides in the last year yet/)).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "After 2000 kJ" }))
    await waitFor(() => expect(urls.some((u) => u.includes("kj_threshold=2000"))).toBe(true))
  })

  it("shows the robustness score and the per-duration table", async () => {
    mock({ "/api/profile/fatigue-resistance": { fit_status: "success", n_long_rides: 6, robustness_score: 91.3, by_duration: [{ duration_s: 300, fr_index_pct: 93.2, n_data_points: 5 }] } })
    render(<FatigueCard />)
    expect(await screen.findByText(/Robustness 91.3% after 1500 kJ, from 6 rides/)).toBeTruthy()
    expect(screen.getByText("5 min")).toBeTruthy()
    expect(screen.getByText("93.2%")).toBeTruthy()
  })
})
