import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { courseUrl } from "@/lib/routes"
import { Elevation, Routes } from "@/screens/Routes"

const route = (n: number, over = {}) => ({
  id: `blue_ridge/r${n}`, name: `Route ${n}`, region: "blue_ridge", crs_region: "blue_ridge", file: `r${n}.crs`, source: "virtual",
  distance_km: 40 + n, climb_m: 500, est_tss: 90, loop: true, terrain: "rolling", primary_surface: "gravel", max_grade: 8,
  preview_profile: [[0, 100], [20, 300], [40, 150]], surface_mix_pct: { asphalt: 27, gravel: 73, cobble: 0 }, tags: [], ...over,
})
const REGIONS = { worlds: [{ region: "blue_ridge", title: "Blue Ridge", count: 2 }], real_world_meta: { regions: [{ region: "alps", title: "Alps", count: 19 }] } }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
function mock(list: () => Response) {
  const urls: string[] = []
  vi.stubGlobal("fetch", vi.fn(async (url: string) => { urls.push(url); return url.startsWith("/api/routes/regions") ? json(REGIONS) : list() }))
  return urls
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("courseUrl", () => {
  it("links the course file, or nothing when the route has none", () => {
    expect(courseUrl({ crs_region: "blue_ridge", file: "a b.crs" })).toBe("/api/course/blue_ridge/a%20b.crs/download")
    expect(courseUrl({ crs_region: null, file: "x.crs" })).toBeNull()
  })
})

describe("Elevation", () => {
  it("draws nothing for fewer than two points", () => {
    const { container } = render(<Elevation points={[[0, 1]]} label="x" />)
    expect(container.querySelector("svg")).toBeNull()
  })
})

describe("Routes", () => {
  it("lists routes with the count, and opens one to its profile and download", async () => {
    mock(() => json({ total_matching: 622, returned: 2, routes: [route(1), route(2)] }))
    render(<Routes />)
    expect(await screen.findByText("Route 1")).toBeTruthy()
    expect(screen.getByText(/Showing 2 of 622/)).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "Route 1" }))
    expect(screen.getByRole("img", { name: /Elevation profile of Route 1, 41 km, 500 m climbing/ })).toBeTruthy()
    expect(screen.getByText(/73% gravel/)).toBeTruthy()
    expect((screen.getByRole("link", { name: "Download course (.crs)" }) as HTMLAnchorElement).getAttribute("href")).toBe("/api/course/blue_ridge/r1.crs/download")
  })

  it("sends the filters after a pause", async () => {
    const urls = mock(() => json({ total_matching: 1, returned: 1, routes: [route(1)] }))
    render(<Routes />)
    await screen.findByText("Route 1")
    await userEvent.selectOptions(screen.getByLabelText("Region"), "alps")
    await userEvent.type(screen.getByLabelText("From (km)"), "30")
    await userEvent.click(screen.getByLabelText("Loops only"))
    await waitFor(() => expect(urls.at(-1)).toContain("loop_only=true"))
    expect(urls.at(-1)).toContain("region=alps")
    expect(urls.at(-1)).toContain("min_km=30")
  })

  it("still lists routes when the region filter can't load", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.startsWith("/api/routes/regions") ? json({}, 500) : json({ total_matching: 1, returned: 1, routes: [route(1)] }))))
    render(<Routes />)
    expect(await screen.findByText("Route 1")).toBeTruthy()
  })

  it("says so when nothing matches, and retries a failed load", async () => {
    let fail = true
    mock(() => (fail ? json({ error: "boom" }, 500) : json({ total_matching: 0, returned: 0, routes: [] })))
    render(<Routes />)
    expect((await screen.findByRole("alert")).textContent).toContain("boom")
    fail = false
    await userEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(await screen.findByText("No routes match.")).toBeTruthy()
  })
})
