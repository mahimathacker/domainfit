import { z } from "zod";
import type { PlannerInput } from "./schemas";
import type { NugenCompletion } from "@/lib/nugen/types";

export const architectureDecisionSchema = z.object({
  recommended_architecture: z.enum(["general_model", "alignment", "rag", "tools", "hybrid"]),
}).strict();

export type ArchitectureDecision = z.infer<typeof architectureDecisionSchema> & { reason: string };

export class ArchitectureDecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchitectureDecisionError";
  }
}

export const architectureDecisionTool = {
  type: "function",
  function: {
    name: "submit_domainfit_decision",
    description: "Submit the final DomainFit architecture decision.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        recommended_architecture: { type: "string", enum: ["general_model", "alignment", "rag", "tools", "hybrid"] },
      },
      required: ["recommended_architecture"],
    },
  },
};

export function buildArchitectureDecisionMessages(input: PlannerInput) {
  const signals = {
    stable_specialist_behavior: input.stable_behaviour.trim().length > 0,
    changing_or_cited_evidence:
      input.citations_required || input.changing_facts.trim().length > 0,
    private_data_or_external_actions: input.live_private_data || input.external_actions,
    high_impact_or_human_approval:
      input.human_approval || ["high", "critical"].includes(input.mistake_impact),
  };
  return [
    {
      role: "system" as const,
      content: "Classify the architecture. Reply with exactly one label and nothing else: general_model, alignment, rag, tools, or hybrid. Use general_model when all specialist signals are false. Use alignment for stable specialist behavior only. Use rag for changing or cited evidence only. Use tools for private data or external actions only. Use hybrid when two or more of alignment, rag, and tools are required.",
    },
    {
      role: "user" as const,
      content: "stable_specialist_behavior=false; changing_or_cited_evidence=false; private_data_or_external_actions=false",
    },
    {
      role: "assistant" as const,
      content: "general_model",
    },
    {
      role: "user" as const,
      content: "stable_specialist_behavior=true; changing_or_cited_evidence=true; private_data_or_external_actions=true",
    },
    {
      role: "assistant" as const,
      content: "hybrid",
    },
    {
      role: "user" as const,
      content: Object.entries(signals).map(([key, value]) => `${key}=${value}`).join("; "),
    },
  ];
}

export function parseArchitectureDecision(completion: NugenCompletion, input: PlannerInput): ArchitectureDecision {
  try {
    const message = completion.choices[0]?.message;
    const call = message?.tool_calls?.[0]?.function;
    if (call?.name === "submit_domainfit_decision") {
      const argumentsValue = typeof call.arguments === "string" ? JSON.parse(call.arguments) : call.arguments;
      return withReason(architectureDecisionSchema.parse(argumentsValue), input);
    }
    if (!message?.content) throw new Error("Nugen did not return an architecture decision");
    const content = message.content.trim();
    const exact = architectureDecisionSchema.safeParse({ recommended_architecture: content });
    if (exact.success) return withReason(exact.data, input);
    const legacyJsonLabel = content.match(/"recommended_architecture"\s*:\s*"(general_model|alignment|rag|tools|hybrid)"/);
    if (legacyJsonLabel) {
      return withReason(architectureDecisionSchema.parse({ recommended_architecture: legacyJsonLabel[1] }), input);
    }
    throw new Error("Nugen did not return one allowed architecture label");
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown decision format";
    throw new ArchitectureDecisionError(detail);
  }
}

function withReason(
  decision: z.infer<typeof architectureDecisionSchema>,
  input: PlannerInput,
): ArchitectureDecision {
  const reasons = [];
  if (input.stable_behaviour.trim()) reasons.push("stable specialist behaviour");
  if (input.citations_required || input.changing_facts.trim()) reasons.push("changing or cited evidence");
  if (input.live_private_data || input.external_actions) reasons.push("private data or controlled actions");
  const requirements = reasons.length ? reasons.join(", ") : "general-purpose generation only";
  return {
    ...decision,
    reason: `${input.domain || "This"} use case was classified as ${decision.recommended_architecture.replace("_", " ")} based on its need for ${requirements}.`,
  };
}
