/** Sends uncaught errors to the server's diagnostics log, where Settings → Diagnostics shows them. Never throws. */
export function report(code: string, context: Record<string, unknown>) {
  try {
    fetch("/api/diag/frontend-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, context, url: location.href, user_agent: navigator.userAgent }),
    }).catch(() => {})
  } catch {
    /* diagnostics must never raise */
  }
}

export function installErrorReporting(target: Window = window) {
  target.addEventListener("error", (e) =>
    report("E_FRONTEND_UNHANDLED", { msg: String(e.message ?? ""), src: String(e.filename ?? ""), line: e.lineno ?? 0, col: e.colno ?? 0 }),
  )
  target.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as { message?: unknown } | null
    report("E_FRONTEND_PROMISE_REJECT", { reason: String(r?.message ?? r ?? "").slice(0, 300) })
  })
}
