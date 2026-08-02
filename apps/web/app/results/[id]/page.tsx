import type { Metadata } from "next";
import { ArchitecturePlan } from "@/components/results/ArchitecturePlan";

export const metadata: Metadata = { title: "Architecture plan" };

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ArchitecturePlan id={id} />;
}
