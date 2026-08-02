import { NextResponse } from "next/server";
import { createMockResult } from "@/lib/domainfit/mock-result";
import { buildPlanPrompt } from "@/lib/domainfit/prompt";
import { plannerSchema } from "@/lib/domainfit/schemas";
import { completionText, NugenServerClient, NugenServerError } from "@/lib/nugen/client.server";
import { ModelOutputError, parseDomainFitResult } from "@/lib/nugen/model-output.server";

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
    let feedback: string | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const completion = await client.complete({ model, prompt: buildPlanPrompt(parsed.data, feedback) });
      try {
        return NextResponse.json({ result: parseDomainFitResult(completionText(completion)), mode: "live", usage: completion.usage });
      } catch (error) {
        if (!(error instanceof ModelOutputError)) throw error;
        feedback = error.validationFeedback;
        if (attempt === 1) return NextResponse.json({ error: "The model returned an invalid structured result after one retry", details: feedback }, { status: 502 });
      }
    }
  } catch (error) {
    const message = error instanceof NugenServerError ? error.message : "Unable to generate the plan";
    const status = error instanceof NugenServerError && error.status && error.status < 500 ? 502 : 503;
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json({ error: "Unable to generate the plan" }, { status: 500 });
}

