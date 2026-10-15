import { useSyncExternalStore } from "react"

import { Button } from "@/components/ui/button"
import { ProfilePicker } from "@/screens/ProfilePicker"

// ponytail: hash routing, no router dependency. Swap for react-router when nested routes or loaders are needed.
const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb)
  return () => window.removeEventListener("hashchange", cb)
}
const useRoute = () =>
  useSyncExternalStore(subscribe, () => window.location.hash.replace(/^#\/?/, ""))

export function App() {
  const route = useRoute()
  if (route === "profile-picker") return <ProfilePicker />
  return (
    <div className="flex min-h-svh p-6">
      <div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
        <h1 className="font-medium">Domestique Enhanced</h1>
        <Button className="w-fit" render={<a href="#/profile-picker" />}>
          Profile picker
        </Button>
        <Button className="w-fit" variant="outline" render={<a href="/" />}>
          Open legacy dashboard
        </Button>
      </div>
    </div>
  )
}

export default App
