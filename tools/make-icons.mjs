// Regenerates the PNG icons from assets/logo.svg (Chromium via Playwright, run from web/):
//   cd web && node ../tools/make-icons.mjs
// Then the Windows and macOS formats:
//   python3 tools/make-icons.py
import { createRequire } from "node:module"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const { chromium } = createRequire(join(root, "web/package.json"))("@playwright/test")
const svg = readFileSync(join(root, "assets/logo.svg"), "utf8")
// Apple adds its own rounded corners, so its icon is a full square.
const square = svg.replace(' rx="14"', "")
const out = (p) => join(root, p)
const jobs = [
  ...[16, 24, 32, 48, 64, 128, 256].map((n) => [n, svg, `assets/linux/hicolor/${n}x${n}/apps/shepherd.png`]),
  [256, svg, "assets/linux/shepherd.png"],
  [256, svg, "assets/icon.png"],
  [1024, svg, "assets/.icon-1024.png"],
  [32, svg, "web/public/favicon.png"],
  [180, square, "web/public/apple-touch-icon.png"],
]
const browser = await chromium.launch()
const page = await browser.newPage()
for (const [size, markup, path] of jobs) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`)
  mkdirSync(dirname(out(path)), { recursive: true })
  writeFileSync(out(path), await page.screenshot({ omitBackground: true }))
}
await browser.close()
