import { ArrowRight, Database, Gauge, Wrench } from "lucide-react";
import Link from "next/link";

const lanes = [
  { icon: Gauge, title: "Alignment", copy: "Teach stable domain behaviour, terminology, formats, and escalation patterns." },
  { icon: Database, title: "Retrieval", copy: "Ground answers in current, approved evidence when facts change or citations matter." },
  { icon: Wrench, title: "Tools", copy: "Access live or private data and perform permission-checked actions outside the model." },
];

export default function HomePage() {
  return (
    <>
      <section className="shell grid gap-12 py-20 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:py-28">
        <div>
          <p className="eyebrow">Developer use-case planner</p>
          <h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-7xl">From use case to tested alignment plan.</h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-ink/65">Decide whether your AI product needs a general model, domain alignment, retrieval, tools, or a deliberate combination—and leave with artifacts you can implement.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/planner" className="button-primary">Plan my architecture <ArrowRight size={17} /></Link>
            <Link href="/methodology" className="button-secondary">Read the methodology</Link>
          </div>
          <p className="mt-5 text-sm text-ink/50">The Nugen-aligned model makes the architecture decision. DomainFit turns that decision and the developer’s inputs into a deterministic implementation plan.</p>
        </div>
        <div className="card overflow-hidden p-6 sm:p-8">
          <div className="flex items-center justify-between border-b border-line pb-5"><span className="font-semibold">Architecture signal</span><span className="rounded-full bg-lime px-3 py-1 text-xs font-bold">HYBRID</span></div>
          <div className="space-y-3 py-6">
            {["Stable support behaviour", "Changing policy evidence", "Permission-checked actions"].map((item, index) => <div key={item} className="flex items-center gap-4 rounded-xl bg-canvas p-4"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-xs text-white">0{index + 1}</span><span className="font-medium">{item}</span></div>)}
          </div>
          <div className="rounded-xl border border-moss/20 bg-moss p-5 text-white"><p className="text-xs font-bold uppercase tracking-wider text-lime">Output</p><p className="mt-2 text-sm leading-6 text-white/75">Architecture, readiness score, benchmark plan, safety boundaries, and implementation sequence.</p></div>
        </div>
      </section>

      <section className="border-y border-line bg-paper py-20">
        <div className="shell"><p className="eyebrow">One model is not the whole system</p><h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">Put each responsibility where it belongs.</h2><div className="mt-10 grid gap-5 md:grid-cols-3">{lanes.map(({ icon: Icon, title, copy }) => <article key={title} className="rounded-2xl border border-line p-6"><Icon size={24} /><h3 className="mt-8 text-xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-ink/60">{copy}</p></article>)}</div></div>
      </section>

      <section className="shell py-20">
        <div className="card grid gap-8 p-8 sm:p-12 lg:grid-cols-[.7fr_1.3fr]">
          <div><p className="eyebrow">Useful by default</p><h2 className="mt-4 text-3xl font-semibold tracking-tight">Not another generic AI answer.</h2></div>
          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">{["A structured architecture recommendation", "Alignment-readiness and document gaps", "Editable benchmark questions", "Alignment, RAG, tool, and deterministic scopes", "Human-review requirements", "A downloadable implementation artifact"].map(item => <div key={item} className="flex gap-3 border-t border-line pt-4"><span className="text-moss">✓</span><p className="font-medium">{item}</p></div>)}</div>
        </div>
      </section>
    </>
  );
}
