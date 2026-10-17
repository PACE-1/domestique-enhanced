import { expect, test, type APIRequestContext } from "@playwright/test"

// One real browser, one real backend on a throwaway data root. The tests run in
// order and build on each other: first-run setup, a second profile, switching,
// then the DFA tab and keyboard navigation.
test.describe.configure({ mode: "serial" })

const api = (request: APIRequestContext, path: string) =>
  request.get(new URL(path, "http://127.0.0.1:" + (process.env.E2E_PORT ?? 22488)).toString())

test("first-run setup walks four steps and saves only what was touched", async ({ page, request }) => {
  await page.goto("#/setup")
  await page.getByRole("button", { name: "Continue without intervals.icu" }).click()
  await page.getByLabel("FTP — Functional Threshold Power (watts)").fill("265")
  await page.getByRole("button", { name: "Next" }).click()
  await page.getByRole("button", { name: "Next" }).click()
  await page.getByRole("button", { name: "Complete Setup" }).click()
  await expect(page.getByText("Setup complete!")).toBeVisible()
  const profiles = await (await api(request, "/api/profiles")).json()
  const active = profiles.profiles.find((p: { id: string }) => p.id === profiles.active)
  expect(active.ftp).toBe(265)
})

test("an out-of-range value blocks Next with a message", async ({ page }) => {
  await page.goto("#/setup")
  await page.getByRole("button", { name: "Continue without intervals.icu" }).click()
  await page.getByLabel("FTP — Functional Threshold Power (watts)").fill("9000")
  await expect(page.getByText("Must be between 50 and 600")).toBeVisible()
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled()
})

test("the new-profile wizard creates and activates a profile", async ({ page, request }) => {
  await page.goto("#/profile-setup")
  await page.getByLabel("Display Name").fill("Anna")
  await page.getByRole("button", { name: "Next" }).click()
  await page.getByRole("button", { name: "Create profile" }).click()
  await expect(page.getByText("Your training data")).toBeVisible()
  const profiles = await (await api(request, "/api/profiles")).json()
  expect(profiles.active).toBe("anna")
  expect(profiles.profiles.map((p: { name: string }) => p.name)).toContain("Anna")
})

test("the picker lists riders and keyboard activation switches profile", async ({ page, request }) => {
  await page.goto("#/profile-picker")
  await expect(page.getByLabel("Ride as Anna")).toBeVisible()
  await expect(page.getByLabel("Ride as Isaac")).toBeVisible()
  await page.getByLabel("Ride as Isaac").focus()
  await page.keyboard.press("Enter")
  await expect.poll(async () => (await (await api(request, "/api/profiles")).json()).active).toBe("default")
})

test("deleting needs the typed confirmation", async ({ page, request }) => {
  await page.goto("#/profile-picker")
  await page.getByLabel("Settings for Anna").click()
  const del = page.getByRole("button", { name: "Delete account" })
  await expect(del).toBeDisabled()
  await page.getByLabel("Type DELETE to enable deletion").fill("DELETE")
  await del.click()
  await expect.poll(async () =>
    (await (await api(request, "/api/profiles")).json()).profiles.map((p: { id: string }) => p.id),
  ).not.toContain("anna")
})

test("navigation is keyboard reachable and marks the current section", async ({ page }) => {
  await page.goto("#/dfa")
  const nav = page.getByRole("navigation", { name: "Sections" })
  await expect(nav.getByRole("link", { name: "DFA α1" })).toHaveAttribute("aria-current", "page")
  await nav.getByRole("link", { name: "Home" }).focus()
  await page.keyboard.press("Tab")
  await expect(nav.getByRole("link", { name: "Workout Shuffle" })).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(page.getByText("has not moved to the new interface yet")).toBeVisible()
})

test("the DFA tab shows its empty state, and a failed load says so", async ({ page }) => {
  await page.goto("#/dfa")
  await expect(page.getByText("No thresholds detected yet.")).toBeVisible()
  await page.route("**/api/profile/dfa-rides", (r) => r.fulfill({ status: 500, body: "{}" }))
  await page.reload()
  await expect(page.getByText("Failed to load DFA data (500)")).toBeVisible()
})

test("Home shows the plan, this week and fitness from the typed reads", async ({ page, request }) => {
  const base = "http://127.0.0.1:" + (process.env.E2E_PORT ?? 22488)
  const gen = await request.post(base + "/api/plan/generate", {
    data: { goal_type: "ftp", hours_per_week: 8, plan_weeks: 8, available_days: [0, 1, 2, 3, 4, 5, 6], rest_days: [] },
  })
  expect(gen.ok()).toBeTruthy()
  await page.goto("#/home")
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible()
  await expect(page.getByText(/TSS planned/)).toBeVisible()
  await expect(page.getByText("FTP", { exact: true })).toBeVisible()
  await expect(page.getByText(/Loading…/)).toHaveCount(0)
})

test("Plan lists the generated weeks and steps through them", async ({ page }) => {
  await page.goto("#/plan")
  await expect(page.getByRole("heading", { name: /^Week \d+/ })).toBeVisible()
  await expect(page.getByText(/TSS planned/)).toBeVisible()
  const next = page.getByRole("button", { name: "Next week" })
  await next.click()
  await expect(page.getByRole("heading", { name: /^Week \d+/ })).toBeVisible()
})

test("a session can be dismissed and restored from the Plan", async ({ page }) => {
  await page.goto("#/plan")
  await page.getByRole("button", { name: /^Dismiss / }).first().click()
  await expect(page.getByText(/· dismissed/).first()).toBeVisible()
  await page.getByRole("button", { name: /^Restore / }).first().click()
  await expect(page.getByText(/· dismissed/)).toHaveCount(0)
})
