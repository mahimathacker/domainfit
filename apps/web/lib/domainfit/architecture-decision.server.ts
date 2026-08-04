import { z } from "zod";
import type { PlannerInput } from "./schemas";
import type { NugenCompletion } from "@/lib/nugen/types";

export const architectureDecisionSchema = z.object({
  recommended_architecture: z.enum(["general_model", "alignment", "rag", "tools", "hybrid"]),
  reason: z.string().min(10).max(500),
}).strict();

export type ArchitectureDecision = z.infer<typeof architectureDecisionSchema>;

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
        reason: { type: "string" },
      },
      required: ["recommended_architecture", "reason"],
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
      content: "You are DomainFit. Choose exactly one architecture from general_model, alignment, rag, tools, or hybrid. Use general_model when all specialist signals are false. Use alignment for stable specialist behavior only. Use rag for changing or cited evidence only. Use tools for private data or external actions only. Use hybrid when two or more of alignment, rag, and tools are required. Return only valid JSON with exactly recommended_architecture and reason.",
    },
    {
      role: "user" as const,
      content: "A low-risk assistant rewrites ordinary notes with no specialist behavior, changing facts, private data, or actions.",
    },
    {
      role: "assistant" as const,
      content: '{"recommended_architecture":"general_model","reason":"Rewriting is a broad capability and requires no specialist behavior or runtime data."}',
    },
    {
      role: "user" as const,
      content: "Signals: stable_specialist_behavior=true; changing_or_cited_evidence=true; private_data_or_external_actions=true; high_impact_or_human_approval=true.",
    },
    {
      role: "assistant" as const,
      content: '{"recommended_architecture":"hybrid","reason":"Stable specialist behavior, current evidence, and controlled private actions require multiple architecture layers."}',
    },
    {
      role: "user" as const,
      content: `Choose the architecture for these signals and return the same two-key JSON shape: ${Object.entries(signals).map(([key, value]) => `${key}=${value}`).join("; ")}.`,
    },
  ];
}

export function parseArchitectureDecision(completion: NugenCompletion): ArchitectureDecision {
  try {
    const message = completion.choices[0]?.message;
    const call = message?.tool_calls?.[0]?.function;
    if (call?.name === "submit_domainfit_decision") {
      const argumentsValue = typeof call.arguments === "string" ? JSON.parse(call.arguments) : call.arguments;
      return architectureDecisionSchema.parse(argumentsValue);
    }
    if (!message?.content) throw new Error("Nugen did not return an architecture decision");
    const start = message.content.indexOf("{");
    const end = message.content.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error("Nugen returned incomplete decision JSON");
    return architectureDecisionSchema.parse(JSON.parse(message.content.slice(start, end + 1)));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown decision format";
    throw new ArchitectureDecisionError(detail);
  }
}
