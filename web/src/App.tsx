import { useSyncExternalStore } from "react"

import { AppShell, NotMigrated, TABS, isTab } from "@/components/AppShell"
import { Dfa } from "@/screens/Dfa"
import { ProfilePicker } from "@/screens/ProfilePicker"
import { ProfileSetup } from "@/screens/ProfileSetup"
import { Setup } from "@/screens/Setup"

// ponytail: hash routing, no router dependency. Swap for react-router when nested routes or loaders are needed.
const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb)
  return () => window.removeEventListener("hashchange", cb)
}
// The intervals.icu OAuth callback returns to /v2/?wizard=...&icu=..., with no hash.
const currentRoute = () =>
  window.location.hash.replace(/^#\/?/, "") || (new URLSearchParams(window.location.search).get("wizard") ?? "")
const useRoute = () => useSyncExternalStore(subscribe, currentRoute)

export function App() {
  const route = useRoute()
  if (route === "profile-picker") return <ProfilePicker />
  if (route === "profile-setup") return <ProfileSetup />
  if (route === "setup") return <Setup />
  const tab = isTab(route) ? route : "home"
  return (
    <AppShell tab={tab}>
      {tab === "dfa" ? <Dfa /> : <NotMigrated label={TABS.find((t) => t.id === tab)!.label} />}
    </AppShell>
  )
}

export default App
