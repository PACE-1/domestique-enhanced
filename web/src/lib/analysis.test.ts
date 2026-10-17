import { describe, expect, it } from "vitest"

import { fmtDuration, plot } from "@/lib/analysis"

describe("plot", () => {
  it("returns nothing without points", () => {
    expect(plot([{ name: "a", color: "#000", points: [] }], 300, 100)).toBeNull()
  })

  it("maps the lowest y to the bottom and the highest to the top, and marks zero when crossed", () => {
    const g = plot([{ name: "a", color: "#000", points: [{ x: 0, y: -10 }, { x: 1, y: 10 }] }], 300, 100, 0)!
    expect(g.paths[0].d).toBe("M0.0,100.0 L300.0,0.0")
    expect(g.zeroY).toBe(50)
    expect([g.y0, g.y1]).toEqual([-10, 10])
  })

  it("centres a flat series instead of dividing by zero", () => {
    const g = plot([{ name: "a", color: "#000", points: [{ x: 0, y: 5 }, { x: 1, y: 5 }] }], 300, 100, 0)!
    expect(g.paths[0].d).toBe("M0.0,50.0 L300.0,50.0")
    expect(g.zeroY).toBeNull()
  })
})

describe("fmtDuration", () => {
  it("picks a unit", () => {
    expect([5, 300, 3600, 5400].map(fmtDuration)).toEqual(["5 s", "5 min", "1.0 h", "1.5 h"])
  })
})
