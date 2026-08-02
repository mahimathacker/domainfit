"use client";

import { Download, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { domainFitResultSchema, type DomainFitResult } from "@/lib/domainfit/schemas";

export function ArchitecturePlan({ id }: { id: string }) {
  const [result, setResult] = useState<DomainFitResult | null>(null);
  const [mode, setMode] = useState<"mock" | "live">("mock");
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    const stored = window.localStorage.getItem(`domainfit:result:${id}`);
    if (!stored) { setMissing(true); return; }
    try {
      const record = JSON.parse(stored);
      setResult(domainFitResultSchema.parse(record.result));
      setMode(record.mode === "live" ? "live" : "mock");
    } catch { setMissing(true); }
  }, [id]);

  if (missing) return <div className="shell py-24"><div className="card mx-auto max-w-xl p-10 text-center"><h1 className="text-3xl font-semibold">Plan not found</h1><p className="mt-4 text-ink/60">Results are stored in this browser during mock mode.</p><Link href="/planner" className="button-primary mt-7">Create a new plan</Link></div></div>;
  if (!result) return <ResultSkeleton />;
  return <Results result={result} mode={mode} onChange={setResult} />;
}

function Results({ result, mode, onChange }: { result: DomainFitResult; mode: "mock" | "live"; onChange: (value: DomainFitResult) => void }) {
  function download() {
    const payload = result.benchmark_plan.map((item, index) => ({ id: `domainfit-${String(index + 1).padStart(3, "0")}`, ...item }));
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "domainfit-benchmark.json"; anchor.click(); URL.revokeObjectURL(url);
  }
  return <div className="shell py-12 sm:py-16"><div className="flex flex-col gap-6 border-b border-line pb-10 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-3"><p className="eyebrow">Your architecture plan</p><span className="rounded-full bg-lime px-3 py-1 text-xs font-bold uppercase">{mode === "live" ? "Nugen result" : "Mock result"}</span></div><h1 className="mt-4 text-4xl font-semibold capitalize tracking-tight sm:text-6xl">{result.recommended_architecture.replace("_", " ")}</h1><p className="mt-5 max-w-3xl text-lg leading-8 text-ink/65">{result.summary}</p></div><div className="shrink-0 rounded-2xl bg-ink p-5 text-white"><p className="text-xs uppercase tracking-wider text-white/60">Confidence</p><p className="mt-1 text-3xl font-semibold">{Math.round(result.confidence * 100)}%</p></div></div>
    <div className="mt-8 grid gap-5 lg:grid-cols-3"><ScopeCard title="Learn through alignment" items={result.alignment_scope} empty="No alignment scope recommended." /><ScopeCard title="Retrieve at runtime" items={result.runtime_retrieval_scope} empty="No retrieval scope recommended." /><ScopeCard title="Use tools or APIs" items={result.tool_scope} empty="No tool scope recommended." /></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><section className="card p-7"><h2 className="text-2xl font-semibold">Why this architecture</h2><div className="mt-5 divide-y divide-line">{result.decision_factors.map(item => <div key={item.factor} className="grid gap-2 py-4 sm:grid-cols-[11rem_1fr]"><h3 className="font-semibold">{item.factor}</h3><p className="text-sm leading-6 text-ink/60">{item.impact}</p></div>)}</div></section><section className="card p-7"><div className="flex items-center justify-between"><h2 className="text-2xl font-semibold">Document readiness</h2><span className="text-3xl font-semibold text-moss">{result.document_readiness.score}</span></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-moss" style={{ width: `${result.document_readiness.score}%` }} /></div><List title="Gaps" items={result.document_readiness.gaps} /><List title="Prepare next" items={result.document_readiness.recommended_documents} /></section></div>
    <section className="card mt-5 p-7"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="eyebrow">Editable artifact</p><h2 className="mt-2 text-2xl font-semibold">Benchmark plan</h2></div><button className="button-secondary" onClick={download}><Download size={16} /> Download JSON</button></div><div className="mt-7 space-y-4">{result.benchmark_plan.map((item, index) => <article className="rounded-xl border border-line p-5" key={`${item.category}-${index}`}><span className="text-xs font-bold uppercase tracking-wider text-moss">{item.category}</span><label className="label mt-4">Question<textarea className="field min-h-20" value={item.question} onChange={event => { const benchmark_plan = result.benchmark_plan.map((existing, current) => current === index ? { ...existing, question: event.target.value } : existing); onChange({ ...result, benchmark_plan }); }} /></label><label className="label mt-4">Expected answer<textarea className="field min-h-24" value={item.expected_answer} onChange={event => { const benchmark_plan = result.benchmark_plan.map((existing, current) => current === index ? { ...existing, expected_answer: event.target.value } : existing); onChange({ ...result, benchmark_plan }); }} /></label><p className="mt-3 text-sm leading-6 text-ink/50">{item.rationale}</p></article>)}</div></section>
    <div className="mt-5 grid gap-5 lg:grid-cols-2"><section className="card p-7"><h2 className="text-2xl font-semibold">Implementation sequence</h2><ol className="mt-5 space-y-4">{result.implementation_steps.map((item, index) => <li key={item} className="flex gap-4"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-xs text-white">{index + 1}</span><span className="leading-7 text-ink/70">{item}</span></li>)}</ol></section><section className="card p-7"><div className="flex gap-3"><ShieldCheck className="text-moss" /><h2 className="text-2xl font-semibold">Review and safeguards</h2></div><p className="mt-5 font-semibold">Human review: {result.human_review.required ? "Required" : "Conditional"}</p><List title="Deterministic application logic" items={result.deterministic_logic} /><List title="Risks" items={result.risks} /><List title="Limitations" items={result.limitations} /></section></div>
  </div>;
}

function ScopeCard({ title, items, empty }: { title: string; items: string[]; empty: string }) { return <section className="card p-6"><h2 className="font-semibold">{title}</h2><ul className="mt-5 space-y-3 text-sm leading-6 text-ink/65">{items.length ? items.map(item => <li key={item} className="border-l-2 border-lime pl-3">{item}</li>) : <li>{empty}</li>}</ul></section>; }
function List({ title, items }: { title: string; items: string[] }) { if (!items.length) return null; return <div className="mt-6"><h3 className="text-xs font-bold uppercase tracking-wider text-moss">{title}</h3><ul className="mt-3 space-y-2 text-sm leading-6 text-ink/65">{items.map(item => <li key={item}>— {item}</li>)}</ul></div>; }
function ResultSkeleton() { return <div className="shell animate-pulse py-16" aria-label="Loading result"><div className="h-5 w-40 rounded bg-line" /><div className="mt-5 h-16 max-w-xl rounded bg-line" /><div className="mt-8 grid gap-5 lg:grid-cols-3">{[1, 2, 3].map(item => <div className="h-48 rounded-2xl bg-line" key={item} />)}</div></div>; }
