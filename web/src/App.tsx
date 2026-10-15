import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

export function App() {
  const [version, setVersion] = useState<string>("…")

  useEffect(() => {
    fetch("/api/version")
      .then((r) => r.json())
      .then((d) => setVersion(String(d.version ?? JSON.stringify(d))))
      .catch(() => setVersion("unreachable"))
  }, [])

  return (
    <div className="flex min-h-svh p-6">
      <div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
        <h1 className="font-medium">Domestique Enhanced</h1>
        <p>Backend version: {version}</p>
        <Button
          className="w-fit"
          onClick={() => (window.location.href = "/")}
        >
          Open legacy dashboard
        </Button>
      </div>
    </div>
  )
}

export default App
