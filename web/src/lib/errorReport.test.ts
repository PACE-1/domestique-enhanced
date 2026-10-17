import { afterEach, describe, expect, it, vi } from "vitest"

import { installErrorReporting } from "@/lib/errorReport"

afterEach(() => vi.unstubAllGlobals())

describe("error reporting", () => {
  it("posts uncaught errors and rejected promises to the diagnostics log", () => {
    const sent: { code: string; context: Record<string, unknown> }[] = []
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return new Response("{}") }))
    const w = new EventTarget() as unknown as Window
    installErrorReporting(w)
    w.dispatchEvent(Object.assign(new Event("error"), { message: "boom", filename: "a.js", lineno: 3, colno: 4 }))
    w.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: new Error("nope") }))
    expect(sent.map((s) => s.code)).toEqual(["E_FRONTEND_UNHANDLED", "E_FRONTEND_PROMISE_REJECT"])
    expect(sent[0].context).toEqual({ msg: "boom", src: "a.js", line: 3, col: 4 })
    expect(sent[1].context).toEqual({ reason: "nope" })
  })

  it("stays quiet when the server is unreachable", () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline") }))
    const w = new EventTarget() as unknown as Window
    installErrorReporting(w)
    expect(() => w.dispatchEvent(Object.assign(new Event("error"), { message: "x" }))).not.toThrow()
  })
})
