import type { Metadata } from "next";
import { ArchitecturePlannerForm } from "@/components/planner/ArchitecturePlannerForm";

export const metadata: Metadata = { title: "Architecture planner" };

export default function PlannerPage() {
  const inferenceMode = process.env.NUGEN_MOCK_MODE === "false" ? "live" : "mock";
  return <div className="shell py-12 sm:py-16"><div className="mx-auto max-w-4xl"><p className="eyebrow">Architecture planner</p><h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-6xl">Tell us what the system must do.</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-ink/60">We’ll separate stable behaviour, changing evidence, controlled actions, deterministic logic, and human oversight.</p><ArchitecturePlannerForm inferenceMode={inferenceMode} /></div></div>;
}
