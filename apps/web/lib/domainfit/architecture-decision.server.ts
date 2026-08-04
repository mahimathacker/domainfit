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
  return [
    {
      role: "system" as const,
      content: "You are DomainFit. Choose exactly one architecture from general_model, alignment, rag, tools, or hybrid. Stable specialist behavior belongs to alignment; changing cited evidence to rag; private data and actions to tools; combinations to hybrid. Return only valid JSON with exactly recommended_architecture and reason.",
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
      content: `Analyze this planner input and return the same two-key JSON shape:\n${JSON.stringify(input)}`,
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
