import { NextResponse } from "next/server";
import { createMockResult, createModelAssistedResult } from "@/lib/domainfit/mock-result";
import { plannerSchema } from "@/lib/domainfit/schemas";
import { ArchitectureDecisionError, architectureDecisionTool, buildArchitectureDecisionMessages, parseArchitectureDecision } from "@/lib/domainfit/architecture-decision.server";
import { ArchitectureScopesError, architectureScopesTool, buildArchitectureScopesMessages, parseArchitectureScopes } from "@/lib/domainfit/architecture-scopes.server";
import { DocumentReadinessError, buildDocumentReadinessMessages, documentReadinessTool, parseDocumentReadiness } from "@/lib/domainfit/document-readiness.server";
import { BenchmarkGenerationError, benchmarkGenerationTool, buildBenchmarkGenerationMessages, parseBenchmarkGeneration } from "@/lib/domainfit/benchmark-generation.server";
import { buildDeliveryPlanMessages, DeliveryPlanError, deliveryPlanTool, parseDeliveryPlan } from "@/lib/domainfit/delivery-plan.server";
import { completionText, NugenServerClient, NugenServerError } from "@/lib/nugen/client.server";

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
    const messages = buildArchitectureDecisionMessages(parsed.data);
    const diagnostics: Array<{ task: string; attempt: number; content: string; toolCalls: unknown; error: string }> = [];
    let decision;
    let architectureUsage;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const completion = await client.chatComplete({
        model,
        messages,
        maxTokens: 20,
        temperature: 0.2,
        tools: [architectureDecisionTool],
        toolChoice: { type: "function", function: { name: "submit_domainfit_decision" } },
      });
      try {
        decision = parseArchitectureDecision(completion, parsed.data);
        architectureUsage = completion.usage;
        break;
      } catch (error) {
        if (!(error instanceof ArchitectureDecisionError)) throw error;
        diagnostics.push({
          task: "architecture_decision",
          attempt: attempt + 1,
          content: completionText(completion).slice(0, 1000),
          toolCalls: completion.choices[0]?.message?.tool_calls ?? null,
          error: error.message,
        });
        if (attempt === 1) {
          return NextResponse.json(
            {
              error: "The aligned model returned an invalid architecture decision after one repair attempt",
              details: error.message,
              ...(process.env.NODE_ENV !== "production" ? { diagnostics } : {}),
            },
            { status: 502 },
          );
        }
        messages.push(
          { role: "assistant", content: completionText(completion) },
          { role: "user", content: "Invalid. Reply with one label only: general_model, alignment, rag, tools, or hybrid." },
        );
      }
    }
    if (!decision) throw new ArchitectureDecisionError("Nugen did not produce an architecture decision");

    const scopeMessages = buildArchitectureScopesMessages(parsed.data, decision);
    let scopes;
    let scopesUsage;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const completion = await client.chatComplete({
        model,
        messages: scopeMessages,
        maxTokens: 500,
        temperature: 0.2,
        tools: [architectureScopesTool],
        toolChoice: { type: "function", function: { name: "submit_architecture_scopes" } },
      });
      try {
        scopes = parseArchitectureScopes(completion);
        scopesUsage = completion.usage;
        break;
      } catch (error) {
        if (!(error instanceof ArchitectureScopesError)) throw error;
        diagnostics.push({
          task: "architecture_scopes",
          attempt: attempt + 1,
          content: completionText(completion).slice(0, 1500),
          toolCalls: completion.choices[0]?.message?.tool_calls ?? null,
          error: error.message,
        });
        if (attempt === 1) {
          return NextResponse.json(
            {
              error: "The aligned model returned invalid architecture scopes after one repair attempt",
              details: error.message,
              ...(process.env.NODE_ENV !== "production" ? { diagnostics } : {}),
            },
            { status: 502 },
          );
        }
        scopeMessages.push({
          role: "user",
          content: '{"alignment_scope":["use-case-specific responsibility"],"runtime_retrieval_scope":[],"tool_scope":[],"deterministic_logic":["use-case-specific validation"]} Return only this JSON shape, replacing the example content for the latest use case.',
        });
      }
    }
    if (!scopes) throw new ArchitectureScopesError("Nugen did not produce architecture scopes");

    const readinessMessages = buildDocumentReadinessMessages(parsed.data, decision, scopes);
    let documentReadiness;
    let documentReadinessUsage;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const completion = await client.chatComplete({
        model,
        messages: readinessMessages,
        maxTokens: 500,
        temperature: 0.2,
        tools: [documentReadinessTool],
        toolChoice: { type: "function", function: { name: "submit_document_readiness" } },
      });
      try {
        documentReadiness = parseDocumentReadiness(completion);
        documentReadinessUsage = completion.usage;
        break;
      } catch (error) {
        if (!(error instanceof DocumentReadinessError)) throw error;
        diagnostics.push({
          task: "document_readiness",
          attempt: attempt + 1,
          content: completionText(completion).slice(0, 1500),
          toolCalls: completion.choices[0]?.message?.tool_calls ?? null,
          error: error.message,
        });
        if (attempt === 1) {
          return NextResponse.json(
            {
              error: "The aligned model returned invalid document readiness after one repair attempt",
              details: error.message,
              ...(process.env.NODE_ENV !== "production" ? { diagnostics } : {}),
            },
            { status: 502 },
          );
        }
        readinessMessages.push(
          { role: "assistant", content: completionText(completion) },
          { role: "user", content: "Return one complete JSON object with exactly score, strengths, gaps, and recommended_documents. Score must be an integer from 0 to 100; the other values must be arrays of short strings." },
        );
      }
    }
    if (!documentReadiness) throw new DocumentReadinessError("Nugen did not produce document readiness");

    const benchmarkMessages = buildBenchmarkGenerationMessages(parsed.data, decision, scopes, documentReadiness);
    let benchmarkGeneration;
    let benchmarkGenerationUsage;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const completion = await client.chatComplete({
        model,
        messages: benchmarkMessages,
        maxTokens: 900,
        temperature: 0.2,
        tools: [benchmarkGenerationTool],
        toolChoice: { type: "function", function: { name: "submit_benchmark_plan" } },
      });
      try {
        benchmarkGeneration = parseBenchmarkGeneration(completion);
        benchmarkGenerationUsage = completion.usage;
        break;
      } catch (error) {
        if (!(error instanceof BenchmarkGenerationError)) throw error;
        diagnostics.push({
          task: "benchmark_generation",
          attempt: attempt + 1,
          content: completionText(completion).slice(0, 2000),
          toolCalls: completion.choices[0]?.message?.tool_calls ?? null,
          error: error.message,
        });
        if (attempt === 1) {
          return NextResponse.json(
            {
              error: "The aligned model returned an invalid benchmark plan after one repair attempt",
              details: error.message,
              ...(process.env.NODE_ENV !== "production" ? { diagnostics } : {}),
            },
            { status: 502 },
          );
        }
        benchmarkMessages.push(
          { role: "assistant", content: completionText(completion) },
          { role: "user", content: "Return one complete JSON object containing benchmark_plan with exactly three items. Every item requires category, question, expected_answer, and rationale strings." },
        );
      }
    }
    if (!benchmarkGeneration) throw new BenchmarkGenerationError("Nugen did not produce a benchmark plan");

    const deliveryMessages = buildDeliveryPlanMessages(parsed.data, decision, scopes, documentReadiness, benchmarkGeneration);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const completion = await client.chatComplete({
        model,
        messages: deliveryMessages,
        maxTokens: 1100,
        temperature: 0.2,
        tools: [deliveryPlanTool],
        toolChoice: { type: "function", function: { name: "submit_delivery_plan" } },
      });
      try {
        const deliveryPlan = parseDeliveryPlan(completion);
        return NextResponse.json({
          result: createModelAssistedResult(parsed.data, decision, scopes, documentReadiness, benchmarkGeneration, deliveryPlan),
          decision,
          mode: "live",
          usage: {
            architecture: architectureUsage,
            scopes: scopesUsage,
            documentReadiness: documentReadinessUsage,
            benchmarkGeneration: benchmarkGenerationUsage,
            deliveryPlan: completion.usage,
          },
        });
      } catch (error) {
        if (!(error instanceof DeliveryPlanError)) throw error;
        diagnostics.push({
          task: "delivery_plan",
          attempt: attempt + 1,
          content: completionText(completion).slice(0, 2500),
          toolCalls: completion.choices[0]?.message?.tool_calls ?? null,
          error: error.message,
        });
        if (attempt === 1) {
          return NextResponse.json(
            {
              error: "The aligned model returned an invalid delivery plan after one repair attempt",
              details: error.message,
              ...(process.env.NODE_ENV !== "production" ? { diagnostics } : {}),
            },
            { status: 502 },
          );
        }
        deliveryMessages.push(
          { role: "assistant", content: completionText(completion) },
          { role: "user", content: "Return one complete JSON object with assumptions, decision_factors, implementation_steps, human_review, risks, and limitations. Follow the requested array sizes and object shapes exactly." },
        );
      }
    }
  } catch (error) {
    const message = error instanceof NugenServerError ? error.message : "Unable to generate the plan";
    const status = error instanceof NugenServerError && error.status && error.status < 500 ? 502 : 503;
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json({ error: "Unable to generate the plan" }, { status: 500 });
}
