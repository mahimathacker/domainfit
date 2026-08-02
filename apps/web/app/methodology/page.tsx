import type { Metadata } from "next";

export const metadata: Metadata = { title: "Methodology" };

const methods = [
  ["General model", "Broad, low-risk work where generic knowledge and prompting are sufficient."],
  ["Domain alignment", "Stable terminology, response behaviour, repeated decisions, formats, or escalation patterns backed by strong examples."],
  ["Retrieval", "Changing facts, exact evidence, approved sources, and citations that must remain current."],
  ["Tools or MCP", "Live or private data, external actions, permissions, calculations, and deterministic checks."],
  ["Hybrid", "Stable specialist behaviour plus current evidence or controlled actions, especially where validation and review matter."],
];

export default function MethodologyPage() {
  return <div className="shell py-16 sm:py-24"><p className="eyebrow">Transparent by design</p><h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">The DomainFit decision framework</h1><p className="mt-6 max-w-3xl text-lg leading-8 text-ink/65">DomainFit recommends the smallest architecture that can meet the stated requirements. It does not assume every problem needs alignment.</p><div className="mt-14 divide-y divide-line border-y border-line">{methods.map(([title, copy], index) => <section key={title} className="grid gap-3 py-7 sm:grid-cols-[5rem_14rem_1fr]"><span className="text-sm font-bold text-moss">0{index + 1}</span><h2 className="text-xl font-semibold">{title}</h2><p className="max-w-2xl leading-7 text-ink/60">{copy}</p></section>)}</div><section className="mt-16 card p-8 sm:p-10"><h2 className="text-2xl font-semibold">How recommendations are evaluated</h2><p className="mt-4 max-w-3xl leading-7 text-ink/65">Base and aligned models receive identical scenarios. We score correct architecture selection, separation of responsibilities, stated assumptions, unsupported claims, safety boundaries, and benchmark quality. Response length is not a quality metric.</p></section></div>;
}

