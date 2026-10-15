import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DEFAULTS, buildSavePayload, type FieldKey } from "@/lib/setup"
import { ProfileSetup } from "@/screens/ProfileSetup"

type Call = { url: string; method: string; body?: Record<string, unknown> }

function mockApi(overrides: Record<string, () => Response> = {}) {
  const calls: Call[] = []
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      if (overrides[url]) return overrides[url]()
      if (url === "/api/setup/limits") return json({})
      if (url === "/api/profiles/create") return json({ ok: true, id: "anna" })
      if (url === "/api/profiles/switch") return json({ ok: true, active: "anna" })
      if (url === "/api/setup/save") return json({ ok: true })
      if (url === "/api/icu/connection") return json({ method: "oauth", name: "Anna", athlete_id: "i1" })
      return json({})
    }),
  )
  return calls
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  sessionStorage.clear()
  window.history.replaceState({}, "", "/")
})

describe("buildSavePayload", () => {
  it("omits untouched fields and maps names", () => {
    const touched = new Set<FieldKey>(["ftp", "age", "wprime", "sex"])
    const values = { ...DEFAULTS, ftp: "250", age: "41", wprime: "21000", sex: "F" }
    expect(buildSavePayload(values, touched, "power", false)).toEqual({
      ftp: 250, age: 41, wprime_j: 21000, sex: "F",
    })
  })
  it("sends target_mode only when chosen", () => {
    expect(buildSavePayload(DEFAULTS, new Set(), "hr", true)).toEqual({ target_mode: "hr" })
    expect(buildSavePayload(DEFAULTS, new Set(), "hr", false)).toEqual({})
  })
})

describe("ProfileSetup", () => {
  it("requires a name before step 2", async () => {
    mockApi()
    render(<ProfileSetup />)
    await userEvent.click(screen.getByRole("button", { name: "Next" }))
    expect(await screen.findByText("Please enter a name.")).toBeTruthy()
  })

  it("creates, activates, then saves only touched fields, in that order", async () => {
    const calls = mockApi()
    render(<ProfileSetup />)
    await userEvent.type(screen.getByLabelText("Display Name"), "Anna")
    await userEvent.click(screen.getByRole("button", { name: "Next" }))
    const ftp = await screen.findByLabelText("FTP (watts)")
    await userEvent.clear(ftp)
    await userEvent.type(ftp, "260")
    await userEvent.click(screen.getByRole("button", { name: "Create profile" }))
    expect(await screen.findByText("Your training data")).toBeTruthy()

    const writes = calls.filter((c) => c.method === "POST")
    expect(writes.map((c) => c.url)).toEqual(["/api/profiles/create", "/api/profiles/switch", "/api/setup/save"])
    expect(writes[0].body).toEqual({ name: "Anna", color: "#3b82f6" })
    expect(writes[2].body).toEqual({ ftp: 260 })
  })

  it("heart-rate mode without LTHR blocks creation and calls nothing", async () => {
    const calls = mockApi()
    render(<ProfileSetup />)
    await userEvent.type(screen.getByLabelText("Display Name"), "Anna")
    await userEvent.click(screen.getByRole("button", { name: "Next" }))
    await userEvent.click(await screen.findByRole("button", { name: "Heart rate only" }))
    await userEvent.click(screen.getByRole("button", { name: "Create profile" }))
    expect(await screen.findByText(/needs your LTHR/)).toBeTruthy()
    expect(calls.filter((c) => c.method === "POST")).toEqual([])
  })

  it("a retry after a failed activation does not create a second profile", async () => {
    let attempt = 0
    const calls = mockApi({
      "/api/profiles/switch": () => {
        attempt += 1
        return new Response(JSON.stringify(attempt === 1 ? { error: "sync busy" } : { active: "anna" }), {
          status: attempt === 1 ? 503 : 200,
        })
      },
    })
    render(<ProfileSetup />)
    await userEvent.type(screen.getByLabelText("Display Name"), "Anna")
    await userEvent.click(screen.getByRole("button", { name: "Next" }))
    const create = await screen.findByRole("button", { name: "Create profile" })
    await userEvent.click(create)
    expect(await screen.findByText(/Could not activate the new profile — sync busy/)).toBeTruthy()
    await userEvent.click(create)
    expect(await screen.findByText("Your training data")).toBeTruthy()
    expect(calls.filter((c) => c.url === "/api/profiles/create")).toHaveLength(1)
  })

  it("explains an intervals.icu sign-in failure from the return URL", async () => {
    mockApi()
    sessionStorage.setItem("ps_wizard", JSON.stringify({ createdId: "anna", step: 3 }))
    window.history.replaceState({}, "", "/v2/?wizard=profile-setup&icu=error&reason=state")
    render(<ProfileSetup />)
    expect(await screen.findByText(/the sign-in link expired/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
  })

  it("shows the linked account after a successful return", async () => {
    mockApi()
    sessionStorage.setItem("ps_wizard", JSON.stringify({ createdId: "anna", step: 3 }))
    window.history.replaceState({}, "", "/v2/?wizard=profile-setup&icu=ok")
    render(<ProfileSetup />)
    expect(await screen.findByText("✓ Connected to intervals.icu")).toBeTruthy()
    await waitFor(() => expect(screen.getByRole("link", { name: "Finish setup" })).toBeTruthy())
    expect(sessionStorage.getItem("ps_wizard")).toBeNull()
  })
})
