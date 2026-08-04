import { NextResponse } from "next/server";
import { createMockResult, createModelAssistedResult } from "@/lib/domainfit/mock-result";
import { plannerSchema } from "@/lib/domainfit/schemas";
import { architectureDecisionTool, buildArchitectureDecisionMessages, parseArchitectureDecision } from "@/lib/domainfit/architecture-decision.server";
import { NugenServerClient, NugenServerError } from "@/lib/nugen/client.server";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = plannerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid planner input", issues: parsed.error.flatten() }, { status: 400 });
  }
  if (process.env.NUGEN_MOCK_MODE !== "false") {
    return NextResponse.json({ result: createMockResult(parsed.data), mode: "mock" });
  }
  const model = process.env.NUGEN_ALIGNED_MODEL;
  if (!model) return NextResponse.json({ error: "NUGEN_ALIGNED_MODEL is not configured" }, { status: 503 });
  try {
    const client = new NugenServerClient();
    const completion = await client.chatComplete({
      model,
      messages: buildArchitectureDecisionMessages(parsed.data),
      maxTokens: 150,
      temperature: 0.2,
      tools: [architectureDecisionTool],
      toolChoice: { type: "function", function: { name: "submit_domainfit_decision" } },
    });
    const decision = parseArchitectureDecision(completion);
    return NextResponse.json({ result: createModelAssistedResult(parsed.data, decision), decision, mode: "live", usage: completion.usage });
  } catch (error) {
    const message = error instanceof NugenServerError ? error.message : "Unable to generate the plan";
    const status = error instanceof NugenServerError && error.status && error.status < 500 ? 502 : 503;
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json({ error: "Unable to generate the plan" }, { status: 500 });
}
