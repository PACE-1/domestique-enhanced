import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { initials, safeColor } from "@/lib/profiles"
import { ProfilePicker } from "@/screens/ProfilePicker"

const RIDERS = [
  { id: "a1", name: "Ada Lovelace", color: "#22c55e", ftp: 250, weight_kg: 62 },
  { id: "b2", name: "Bo", color: "javascript:evil" },
]

function mockApi(profiles = RIDERS) {
  const calls: { url: string; method: string; body?: unknown }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      const body = url === "/api/profiles" ? { profiles } : { ok: true }
      return new Response(JSON.stringify(body), { status: 200 })
    }),
  )
  return calls
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("helpers", () => {
  it("initials and color validation match the legacy picker", () => {
    expect(initials("Ada Lovelace")).toBe("AL")
    expect(initials("bo")).toBe("B")
    expect(initials("  ")).toBe("?")
    expect(safeColor("#22c55e")).toBe("#22c55e")
    expect(safeColor("red; background:url(x)")).toBe("")
  })
})

describe("ProfilePicker", () => {
  it("shows the empty state when there are no profiles", async () => {
    mockApi([])
    render(<ProfilePicker />)
    expect(await screen.findByText("Create your first profile")).toBeTruthy()
  })

  it("lists riders with FTP and weight", async () => {
    mockApi()
    render(<ProfilePicker />)
    expect(await screen.findByText("Ada Lovelace")).toBeTruthy()
    expect(screen.getByText("250W 62kg")).toBeTruthy()
  })

  it("switching posts the id, and skip_picker only when remembered", async () => {
    const calls = mockApi()
    const onSwitched = vi.fn()
    render(<ProfilePicker onSwitched={onSwitched} />)
    await userEvent.click(await screen.findByLabelText("Ride as Ada Lovelace"))
    await waitFor(() => expect(onSwitched).toHaveBeenCalled())
    expect(calls.find((c) => c.url === "/api/profiles/switch")?.body).toEqual({ id: "a1" })

    await userEvent.click(screen.getByRole("checkbox", { name: "Remember my choice" }))
    await userEvent.click(screen.getByLabelText("Ride as Bo"))
    await waitFor(() => expect(onSwitched).toHaveBeenCalledTimes(2))
    const last = calls.filter((c) => c.url === "/api/profiles/switch").at(-1)
    expect(last?.body).toEqual({ id: "b2", skip_picker: true })
  })

  it("delete stays disabled until DELETE is typed, then calls the API", async () => {
    const calls = mockApi()
    render(<ProfilePicker />)
    await userEvent.click(await screen.findByLabelText("Settings for Bo"))
    const del = await screen.findByRole("button", { name: "Delete account" })
    expect((del as HTMLButtonElement).disabled).toBe(true)
    await userEvent.type(screen.getByLabelText("Type DELETE to enable deletion"), "DELETE")
    expect((del as HTMLButtonElement).disabled).toBe(false)
    await userEvent.click(del)
    await waitFor(() =>
      expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/profiles/b2")).toBe(true),
    )
  })

  it("rename saves name and color with PUT", async () => {
    const calls = mockApi()
    render(<ProfilePicker />)
    await userEvent.click(await screen.findByLabelText("Settings for Ada Lovelace"))
    const name = await screen.findByLabelText("Name")
    await userEvent.clear(name)
    await userEvent.type(name, "Ada L")
    await userEvent.click(screen.getByLabelText("Color #ef4444"))
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ name: "Ada L", color: "#ef4444" }),
    )
  })
})
