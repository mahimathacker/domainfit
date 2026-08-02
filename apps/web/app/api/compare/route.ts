import { NextResponse } from "next/server";
import { z } from "zod";
import { buildComparisonPrompt } from "@/lib/domainfit/prompt";
import { completionText, NugenServerClient, NugenServerError } from "@/lib/nugen/client.server";
import type { ModelResponse } from "@/lib/nugen/types";

const requestSchema = z.object({ scenario: z.string().min(10).max(5000) });

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter a scenario of at least 10 characters" }, { status: 400 });
  if (process.env.NUGEN_MOCK_MODE !== "false") return NextResponse.json(mockComparison());
  const baseModel = process.env.NUGEN_BASE_MODEL;
  const alignedModel = process.env.NUGEN_ALIGNED_MODEL;
  if (!baseModel || !alignedModel) return NextResponse.json({ error: "Base and aligned model IDs are not configured" }, { status: 503 });
  try {
    const client = new NugenServerClient();
    const prompt = buildComparisonPrompt(parsed.data.scenario);
    const [base, aligned] = await Promise.all([
      timedCompletion(client, baseModel, prompt),
      timedCompletion(client, alignedModel, prompt),
    ]);
    return NextResponse.json({ base, aligned });
  } catch (error) {
    const message = error instanceof NugenServerError ? error.message : "Unable to compare models";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

async function timedCompletion(client: NugenServerClient, model: string, prompt: string): Promise<ModelResponse> {
  const started = performance.now();
  const completion = await client.complete({ model, prompt });
  return { model: completion.model ?? model, content: completionText(completion), latency_ms: Math.round(performance.now() - started), usage: completion.usage, mode: "live" };
}

function mockComparison(): { base: ModelResponse; aligned: ModelResponse } {
  return {
    base: { model: "nugen-base-mock", content: "Use retrieval for updated guidance and tools for account data and ticket creation. Consider prompting for escalation behaviour.", latency_ms: 418, mode: "mock" },
    aligned: { model: "domainfit-aligned-mock", content: "Use a hybrid architecture: align stable escalation and uncertainty behaviour; retrieve approved current guidance with citations; use authenticated tools for entitlements and approval-gated ticket creation. Keep authorization and approval as deterministic application controls.", latency_ms: 463, mode: "mock" },
  };
}

