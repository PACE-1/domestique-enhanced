export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Options = Omit<RequestInit, "body"> & { json?: unknown }

// Thin wrapper over the existing /api routes: JSON in and out, non-2xx throws ApiError.
export async function api<T>(path: string, { json, ...init }: Options = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: json === undefined ? init.headers : { "Content-Type": "application/json", ...init.headers },
    body: json === undefined ? undefined : JSON.stringify(json),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    let message = text
    try {
      const body = JSON.parse(text)
      message = body.error ?? body.detail ?? text
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}
