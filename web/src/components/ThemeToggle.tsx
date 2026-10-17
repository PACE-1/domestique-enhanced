import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"

const NEXT = { system: "light", light: "dark", dark: "system" } as const
const LABEL = { system: "System theme", light: "Light theme", dark: "Dark theme" } as const
const ICON = { system: MonitorIcon, light: SunIcon, dark: MoonIcon } as const

/** One button that cycles System, Light, Dark. The d key still flips light and dark. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const Icon = ICON[theme]
  return (
    <Button size="icon-sm" variant="ghost" aria-label={`${LABEL[theme]}. Change theme.`} title={LABEL[theme]} onClick={() => setTheme(NEXT[theme])}>
      <Icon />
    </Button>
  )
}
