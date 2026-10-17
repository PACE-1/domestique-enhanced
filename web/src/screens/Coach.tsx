import { useState } from "react"

import type { Insight, LlmConnection } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { askCoach, deleteLlm, getLlm, PRESETS, saveLlm, testLlm, weekInsight, type LlmForm, type Turn } from "@/lib/coach"
import { Panel, useLoad } from "@/screens/panel"

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

const PRIVACY =
  "When you use the coach, a short summary of your fitness, week and recent rides is sent to the provider you choose. Ride files, routes and your intervals.icu key are not. Pick Ollama or LM Studio to keep everything on this computer."

function Connect({ c, onChange }: { c: LlmConnection; onChange: () => void }) {
  const [f, setF] = useState<LlmForm>({ provider: (c.provider as LlmForm["provider"]) || "openai", base_url: c.base_url, model: c.model, api_key: "" })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const [error, setError] = useState("")
  const run = async (what: () => Promise<string>) => {
    setBusy(true)
    setMsg("")
    setError("")
    try {
      setMsg(await what())
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  const save = () =>
    run(async () => {
      await saveLlm(f)
      setF({ ...f, api_key: "" })
      onChange()
      return "Saved."
    })
  const test = () =>
    run(async () => {
      const r = await testLlm()
      return `Connected: ${r.model} replied.`
    })
  const disconnect = () =>
    run(async () => {
      await deleteLlm()
      setF({ provider: "openai", base_url: "", model: "", api_key: "" })
      onChange()
      return "Disconnected."
    })
  return (
    <div className="space-y-3 text-sm">
      <p>{c.configured ? `Connected to ${c.provider === "anthropic" ? "Anthropic" : "an OpenAI-compatible provider"}: ${c.model}.` : "No provider connected."}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Presets">
        {PRESETS.map((p) => (
          <Button key={p.name} size="sm" variant="outline" onClick={() => setF({ ...f, provider: p.provider, base_url: p.base_url, model: p.model })}>
            {p.name}
          </Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Label className="flex-col items-start gap-1">
          Provider type
          <NativeSelect value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value as LlmForm["provider"] })}>
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI-compatible</option>
          </NativeSelect>
        </Label>
        <Label className="flex-col items-start gap-1">
          Model
          <Input value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} />
        </Label>
        <Label className="flex-col items-start gap-1 sm:col-span-2">
          Base URL
          <Input className="w-full" value={f.base_url} placeholder="Leave empty for the provider's own address" onChange={(e) => setF({ ...f, base_url: e.target.value })} />
        </Label>
        <Label className="flex-col items-start gap-1 sm:col-span-2">
          Provider API key
          <Input
            className="w-full"
            type="password"
            autoComplete="off"
            value={f.api_key}
            placeholder={c.has_key ? "Saved. Leave empty to keep it for the same provider and address." : "Not needed for Ollama or LM Studio"}
            onChange={(e) => setF({ ...f, api_key: e.target.value })}
          />
        </Label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !f.model.trim()} onClick={save}>
          Save
        </Button>
        <Button size="sm" variant="outline" disabled={busy || !c.configured} onClick={test}>
          Test connection
        </Button>
        {c.configured && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={disconnect}>
            Disconnect
          </Button>
        )}
      </div>
      {msg && <p role="status">{msg}</p>}
      {error && <p role="alert">Couldn’t do that: {error}</p>}
      <p className="text-xs text-muted-foreground">{PRIVACY}</p>
    </div>
  )
}

/** Settings card: connect a model provider for training insights. */
export function AiCoachSettings() {
  const [load, retry, refresh] = useLoad<LlmConnection>(getLlm)
  return (
    <Panel title="AI coach" load={load} retry={retry}>
      {(c) => <Connect c={c} onChange={refresh} />}
    </Panel>
  )
}

/** A button that asks the coach for one piece of advice and shows the reply under it. */
export function CoachInsight({ label, run }: { label: string; run: () => Promise<Insight> }) {
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState("")
  const [error, setError] = useState("")
  const go = async () => {
    setBusy(true)
    setError("")
    try {
      setText((await run()).text)
    } catch (e) {
      setText("")
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2 text-sm">
      <Button size="sm" variant="outline" disabled={busy} onClick={go}>
        {busy ? "Thinking…" : label}
      </Button>
      {text && <p className="whitespace-pre-wrap" aria-label="Coach reply">{text}</p>}
      {error && (
        <p role="alert">
          {error}
          {/No AI provider/.test(error) && <> <a className="underline" href="#/settings">Open Settings</a>.</>}
        </p>
      )}
    </div>
  )
}

/** Free-form questions about the rider's own training. */
export function AskCoach() {
  const [q, setQ] = useState("")
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const send = async () => {
    const question = q.trim()
    if (!question) return
    setBusy(true)
    setError("")
    try {
      const r = await askCoach(question, turns)
      setTurns([...turns, { role: "user", content: question }, { role: "assistant", content: r.text }])
      setQ("")
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <h2 className="text-sm font-semibold">Ask your coach</h2>
        <CoachInsight label="Review my week" run={weekInsight} />
        {turns.length > 0 && (
          <ul className="space-y-2 text-sm" aria-label="Conversation">
            {turns.map((t, i) => (
              <li key={i} className={t.role === "user" ? "text-muted-foreground" : "whitespace-pre-wrap"}>
                {t.role === "user" ? `You: ${t.content}` : t.content}
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input
            className="w-full"
            aria-label="Your question"
            placeholder="Am I ready for a hard session this week?"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && send()}
          />
          <Button size="sm" disabled={busy || !q.trim()} onClick={send}>
            {busy ? "Thinking…" : "Ask"}
          </Button>
          {turns.length > 0 && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setTurns([])}>
              Clear
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm">
            {error}
            {/No AI provider/.test(error) && <> <a className="underline" href="#/settings">Open Settings</a>.</>}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
