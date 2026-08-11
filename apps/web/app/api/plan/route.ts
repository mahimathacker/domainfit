import { NextResponse } from "next/server";
import { createMockResult, createModelAssistedResult } from "@/lib/domainfit/mock-result";
import { plannerSchema } from "@/lib/domainfit/schemas";
import {
  ArchitectureDecisionError,
  architectureDecisionTool,
  buildArchitectureDecisionMessages,
  parseArchitectureDecision,
} from "@/lib/domainfit/architecture-decision.server";
import { completionText, NugenServerClient, NugenServerError } from "@/lib/nugen/client.server";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = plannerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid planner input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (process.env.NUGEN_MOCK_MODE !== "false") {
    return NextResponse.json({ result: createMockResult(parsed.data), mode: "mock" });
  }

  const model = process.env.NUGEN_ALIGNED_MODEL;
  if (!model) {
    return NextResponse.json({ error: "NUGEN_ALIGNED_MODEL is not configured" }, { status: 503 });
  }

  try {
    const client = new NugenServerClient();
    const messages = buildArchitectureDecisionMessages(parsed.data);
    const diagnostics: Array<{
      task: string;
      attempt: number;
      content: string;
      toolCalls: unknown;
      error: string;
    }> = [];

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const completion = await client.chatComplete({
        model,
        messages,
        maxTokens: 20,
        temperature: 0,
        tools: [architectureDecisionTool],
        toolChoice: { type: "function", function: { name: "submit_domainfit_decision" } },
      });
      try {
        const decision = parseArchitectureDecision(completion, parsed.data);
        return NextResponse.json({
          result: createModelAssistedResult(parsed.data, decision),
          decision,
          mode: "live",
          provenance: {
            architecture_decision: "Nugen aligned model",
            plan_generation: "DomainFit rules",
          },
          usage: completion.usage,
        });
      } catch (error) {
        if (!(error instanceof ArchitectureDecisionError)) throw error;
        diagnostics.push({
          task: "architecture_decision",
          attempt: attempt + 1,
          content: completionText(completion).slice(0, 500),
          toolCalls: completion.choices[0]?.message?.tool_calls ?? null,
          error: error.message,
        });
        if (attempt === 1) {
          return NextResponse.json(
            {
              error: "The aligned model did not return a valid architecture label",
              details: error.message,
              ...(process.env.NODE_ENV !== "production" ? { diagnostics } : {}),
            },
            { status: 502 },
          );
        }
        messages.push({
          role: "user",
          content: "Reply with one label only: general_model, alignment, rag, tools, or hybrid.",
        });
      }
    }
  } catch (error) {
    const message = error instanceof NugenServerError ? error.message : "Unable to generate the plan";
    const status = error instanceof NugenServerError && error.status && error.status < 500 ? 502 : 503;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ error: "Unable to generate the plan" }, { status: 500 });
}
