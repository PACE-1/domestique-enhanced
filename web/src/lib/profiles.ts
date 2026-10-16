import type { Profile } from "@/api/types"
import { api } from "@/lib/api"

export type { Profile }

export const PALETTE = [
  "#4f9cf7", "#6366f1", "#22c55e", "#f59e0b", "#ef4444",
  "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#0ea5e9",
]

export function safeColor(c: unknown): string {
  return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c) ? c : ""
}

export function initials(name: unknown): string {
  if (typeof name !== "string" || !name.trim()) return "?"
  const words = name.trim().split(/\s+/)
  if (words.length >= 2) {
    return (Array.from(words[0])[0] + Array.from(words[1])[0]).toUpperCase().slice(0, 2)
  }
  return Array.from(words[0])[0].toUpperCase()
}

export const listProfiles = () =>
  api<{ profiles: Profile[] }>("/api/profiles").then((d) => d.profiles ?? [])

export const switchProfile = (id: string, skipPicker: boolean) =>
  api("/api/profiles/switch", {
    method: "POST",
    json: skipPicker ? { id, skip_picker: true } : { id },
  })

export const updateProfile = (id: string, name: string, color: string) =>
  api(`/api/profiles/${encodeURIComponent(id)}`, { method: "PUT", json: { name, color } })

export const deleteProfile = (id: string) =>
  api(`/api/profiles/${encodeURIComponent(id)}`, { method: "DELETE" })
