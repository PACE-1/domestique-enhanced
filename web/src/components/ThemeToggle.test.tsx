import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { ThemeProvider } from "@/components/theme-provider"
import { ThemeToggle } from "@/components/ThemeToggle"

beforeEach(() => {
  localStorage.clear()
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never
})
afterEach(cleanup)

describe("ThemeToggle", () => {
  it("cycles system, light, dark and remembers the choice", async () => {
    render(<ThemeProvider defaultTheme="system" storageKey="t"><ThemeToggle /></ThemeProvider>)
    const btn = () => screen.getByRole("button")
    expect(btn().getAttribute("aria-label")).toContain("System theme")
    await userEvent.click(btn())
    expect(btn().getAttribute("aria-label")).toContain("Light theme")
    expect(localStorage.getItem("t")).toBe("light")
    await userEvent.click(btn())
    expect(btn().getAttribute("aria-label")).toContain("Dark theme")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    await userEvent.click(btn())
    expect(btn().getAttribute("aria-label")).toContain("System theme")
  })
})
