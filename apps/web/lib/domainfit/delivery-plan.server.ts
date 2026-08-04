import { z } from "zod";
import type { PlannerInput } from "./schemas";
import type { ArchitectureDecision } from "./architecture-decision.server";
import type { ArchitectureScopes } from "./architecture-scopes.server";
import type { DocumentReadiness } from "./document-readiness.server";
import type { BenchmarkGeneration } from "./benchmark-generation.server";
import type { NugenCompletion } from "@/lib/nugen/types";

const shortItem = z.string().min(3).max(200);

export const deliveryPlanSchema = z.object({
  assumptions: z.array(shortItem).min(1).max(5),
  decision_factors: z.array(z.object({
    factor: z.string().min(3).max(80),
    impact: z.string().min(10).max(240),
  }).strict()).min(3).max(5),
  implementation_steps: z.array(shortItem).min(3).max(7),
  human_review: z.object({
    required: z.boolean(),
    reasons: z.array(shortItem).min(1).max(5),
  }).strict(),
  risks: z.array(shortItem).min(2).max(5),
  limitations: z.array(shortItem).min(1).max(5),
}).strict();

export type DeliveryPlan = z.infer<typeof deliveryPlanSchema>;

export class DeliveryPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryPlanError";
  }
}

export const deliveryPlanTool = {
  type: "function",
  function: {
    name: "submit_delivery_plan",
    description: "Submit a use-case-specific implementation plan and production safeguards.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        assumptions: { type: "array", minItems: 1, maxItems: 5, items: { type: "string" } },
        decision_factors: {
          type: "array",
          minItems: 3,
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            properties: { factor: { type: "string" }, impact: { type: "string" } },
            required: ["factor", "impact"],
          },
        },
        implementation_steps: { type: "array", minItems: 3, maxItems: 7, items: { type: "string" } },
        human_review: {
          type: "object",
          additionalProperties: false,
          properties: {
            required: { type: "boolean" },
            reasons: { type: "array", minItems: 1, maxItems: 5, items: { type: "string" } },
          },
          required: ["required", "reasons"],
        },
        risks: { type: "array", minItems: 2, maxItems: 5, items: { type: "string" } },
        limitations: { type: "array", minItems: 1, maxItems: 5, items: { type: "string" } },
      },
      required: ["assumptions", "decision_factors", "implementation_steps", "human_review", "risks", "limitations"],
    },
  },
};

export function buildDeliveryPlanMessages(
  input: PlannerInput,
  decision: ArchitectureDecision,
  scopes: ArchitectureScopes,
  readiness: DocumentReadiness,
  benchmarks: BenchmarkGeneration,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  return [
    {
      role: "system",
      content: "You are DomainFit. Produce a concise, ordered implementation plan and production safeguards for the supplied developer use case. Every item must be actionable and use-case-specific. Preserve required human approval. Do not claim alignment, retrieval, tools, or documents that are absent from the supplied plan. Risks must describe plausible failure modes; limitations must state what this plan or model cannot guarantee. Return only the requested JSON object.",
    },
    {
      role: "user",
      content: JSON.stringify({
        use_case: input.use_case,
        users: input.users,
        domain: input.domain,
        architecture: decision.recommended_architecture,
        architecture_reason: decision.reason,
        scopes,
        document_readiness: readiness,
        benchmark_categories: benchmarks.benchmark_plan.map(item => item.category),
        mistake_impact: input.mistake_impact,
        human_approval_required: input.human_approval,
        latency_requirements: input.latency_requirements,
        usage_requirements: input.usage_requirements,
      }),
    },
  ];
}

export function parseDeliveryPlan(completion: NugenCompletion): DeliveryPlan {
  try {
    const message = completion.choices[0]?.message;
    const call = message?.tool_calls?.[0]?.function;
    if (call?.name === "submit_delivery_plan") {
      const value = typeof call.arguments === "string" ? JSON.parse(call.arguments) : call.arguments;
      return deliveryPlanSchema.parse(value);
    }
    if (!message?.content) throw new Error("Nugen did not return a delivery plan");
    const start = message.content.indexOf("{");
    const end = message.content.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error("Nugen returned incomplete delivery-plan JSON");
    return deliveryPlanSchema.parse(JSON.parse(message.content.slice(start, end + 1)));
  } catch (error) {
    throw new DeliveryPlanError(error instanceof Error ? error.message : "unknown delivery-plan format");
  }
}
