"use client";

import { useState } from "react";

const scenario = "An internal support assistant must follow a stable escalation policy, cite frequently updated product guidance, read live account entitlements, and create a ticket only after the user approves.";

export function ModelComparison() {
  const [prompt, setPrompt] = useState(scenario);
  const [submitted, setSubmitted] = useState(false);
  return <section className="mt-10"><label className="label" htmlFor="comparison-scenario">Scenario</label><textarea id="comparison-scenario" className="field min-h-36" value={prompt} onChange={event => setPrompt(event.target.value)} /><button className="button-primary mt-4" onClick={() => setSubmitted(true)} disabled={prompt.trim().length < 10}>Compare responses</button>{submitted && <div className="mt-10 grid gap-5 lg:grid-cols-2"><ModelCard title="Base model" badge="Mock" copy="Use retrieval for updated guidance and tools for account data and ticket creation. Consider prompting for escalation behaviour." notes={["Correctly identifies runtime needs", "Does not define approval boundaries", "Benchmark plan is missing"]} /><ModelCard title="DomainFit aligned" badge="Mock aligned" copy="Use a hybrid architecture: align stable escalation and uncertainty behaviour; retrieve approved current guidance with citations; use authenticated tools for entitlements and approval-gated ticket creation." notes={["Separates all four responsibility types", "States deterministic approval boundary", "Names held-out benchmark categories"]} /></div>}</section>;
}

function ModelCard({ title, badge, copy, notes }: { title: string; badge: string; copy: string; notes: string[] }) {
  return <article className="card p-6"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{title}</h2><span className="rounded-full bg-canvas px-3 py-1 text-xs font-bold uppercase">{badge}</span></div><p className="mt-6 leading-7 text-ink/70">{copy}</p><div className="mt-7 border-t border-line pt-5"><p className="text-xs font-bold uppercase tracking-wider text-moss">Rubric notes</p><ul className="mt-3 space-y-2 text-sm text-ink/65">{notes.map(note => <li key={note}>— {note}</li>)}</ul></div></article>;
}
