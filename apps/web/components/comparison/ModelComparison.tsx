"use client";

import { useState } from "react";
import type { ModelResponse } from "@/lib/nugen/types";

const scenario = "An internal support assistant must follow a stable escalation policy, cite frequently updated product guidance, read live account entitlements, and create a ticket only after the user approves.";

export function ModelComparison() {
  const [prompt, setPrompt] = useState(scenario);
  const [responses, setResponses] = useState<{ base: ModelResponse; aligned: ModelResponse } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function compare() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario: prompt }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to compare models");
      setResponses(payload);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to compare models"); }
    finally { setLoading(false); }
  }
  return <section className="mt-10"><label className="label" htmlFor="comparison-scenario">Scenario</label><textarea id="comparison-scenario" className="field min-h-36" value={prompt} onChange={event => setPrompt(event.target.value)} /><button className="button-primary mt-4" onClick={compare} disabled={loading || prompt.trim().length < 10}>{loading ? "Comparing…" : "Compare responses"}</button>{error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}{responses && <div className="mt-10 grid gap-5 lg:grid-cols-2"><ModelCard title="Base model" response={responses.base} notes={["Check runtime needs", "Review approval boundaries", "Assess benchmark coverage"]} /><ModelCard title="DomainFit aligned" response={responses.aligned} notes={["Check responsibility separation", "Review deterministic controls", "Assess stated assumptions"]} /></div>}</section>;
}

function ModelCard({ title, response, notes }: { title: string; response: ModelResponse; notes: string[] }) {
  return <article className="card p-6"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{title}</h2><span className="rounded-full bg-canvas px-3 py-1 text-xs font-bold uppercase">{response.mode}</span></div><p className="mt-2 text-xs text-ink/45">{response.model} · {response.latency_ms} ms{response.usage?.total_tokens ? ` · ${response.usage.total_tokens} tokens` : ""}</p><p className="mt-6 whitespace-pre-wrap leading-7 text-ink/70">{response.content}</p><div className="mt-7 border-t border-line pt-5"><p className="text-xs font-bold uppercase tracking-wider text-moss">Review prompts</p><ul className="mt-3 space-y-2 text-sm text-ink/65">{notes.map(note => <li key={note}>— {note}</li>)}</ul></div></article>;
}
