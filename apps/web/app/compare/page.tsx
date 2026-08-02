import type { Metadata } from "next";
import { ModelComparison } from "@/components/comparison/ModelComparison";

export const metadata: Metadata = { title: "Compare models" };

export default function ComparePage() {
  return <div className="shell py-16 sm:py-20"><p className="eyebrow">Same scenario. Same rubric.</p><h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-6xl">Compare base and aligned models</h1><p className="mt-5 max-w-3xl text-lg leading-8 text-ink/65">Review architecture quality side by side without rewarding verbosity. Mock responses are shown until deployed model IDs are configured.</p><ModelComparison /></div>;
}
