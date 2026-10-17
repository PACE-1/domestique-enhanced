import type { Insight, LlmConnection } from "@/api/types"
import { api } from "@/lib/api"

export const getLlm = () => api<LlmConnection>("/api/llm")
export const deleteLlm = () => api<LlmConnection>("/api/llm", { method: "DELETE" })
export const testLlm = () => api<Insight>("/api/llm/test", { method: "POST" })

export interface LlmForm {
  provider: "anthropic" | "openai"
  base_url: string
  model: string
  api_key: string
}
export const saveLlm = (f: LlmForm) => api<LlmConnection>("/api/llm", { method: "POST", json: f })

/** One-click setups. Models are suggestions; the rider can type any model the provider offers. */
export const PRESETS: { name: string; provider: LlmForm["provider"]; base_url: string; model: string; needsKey: boolean }[] = [
  { name: "Anthropic", provider: "anthropic", base_url: "https://api.anthropic.com", model: "claude-sonnet-5-5", needsKey: true },
  { name: "OpenAI", provider: "openai", base_url: "https://api.openai.com/v1", model: "gpt-4o-mini", needsKey: true },
  { name: "OpenRouter", provider: "openai", base_url: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini", needsKey: true },
  { name: "Ollama (this computer)", provider: "openai", base_url: "http://localhost:11434/v1", model: "llama3.1", needsKey: false },
  { name: "LM Studio (this computer)", provider: "openai", base_url: "http://localhost:1234/v1", model: "local-model", needsKey: false },
]

export const weekInsight = () => api<Insight>("/api/insights/week", { method: "POST", json: { week_offset: 0 } })
export const rideInsight = (id: string) => api<Insight>(`/api/insights/ride/${encodeURIComponent(id)}`, { method: "POST" })
export type Turn = { role: "user" | "assistant"; content: string }
export const askCoach = (question: string, history: Turn[]) => api<Insight>("/api/insights/ask", { method: "POST", json: { question, history } })
