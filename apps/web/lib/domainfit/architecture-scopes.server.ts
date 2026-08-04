import { z } from "zod";
import type { PlannerInput } from "./schemas";
import type { ArchitectureDecision } from "./architecture-decision.server";
import type { NugenCompletion } from "@/lib/nugen/types";

const boundedList = z.array(z.string().min(3).max(180)).max(5);

export const architectureScopesSchema = z.object({
  alignment_scope: boundedList,
  runtime_retrieval_scope: boundedList,
  tool_scope: boundedList,
  deterministic_logic: boundedList.min(1),
}).strict();

export type ArchitectureScopes = z.infer<typeof architectureScopesSchema>;

export class ArchitectureScopesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchitectureScopesError";
  }
}

export const architectureScopesTool = {
  type: "function",
  function: {
    name: "submit_architecture_scopes",
    description: "Submit concise, use-case-specific responsibilities for each architecture layer.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        alignment_scope: { type: "array", maxItems: 5, items: { type: "string" } },
        runtime_retrieval_scope: { type: "array", maxItems: 5, items: { type: "string" } },
        tool_scope: { type: "array", maxItems: 5, items: { type: "string" } },
        deterministic_logic: { type: "array", minItems: 1, maxItems: 5, items: { type: "string" } },
      },
      required: ["alignment_scope", "runtime_retrieval_scope", "tool_scope", "deterministic_logic"],
    },
  },
};

export function buildArchitectureScopesMessages(
  input: PlannerInput,
  decision: ArchitectureDecision,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  return [
    {
      role: "system" as const,
      content: "You are DomainFit. Define concise responsibilities for alignment, runtime retrieval, tools, and deterministic application logic. Every item must be specific to the supplied use case. Use an empty array when a layer is unnecessary. Never place changing facts in alignment, never place external actions in retrieval, and always keep validation and authorization deterministic. Return only the requested JSON object.",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        architecture: decision.recommended_architecture,
        use_case: input.use_case,
        users: input.users,
        domain: input.domain,
        stable_behaviour: input.stable_behaviour,
        changing_facts: input.changing_facts,
        citations_required: input.citations_required,
        live_private_data: input.live_private_data,
        external_actions: input.external_actions,
        mistake_impact: input.mistake_impact,
        human_approval: input.human_approval,
      }),
    },
  ];
}

export function parseArchitectureScopes(completion: NugenCompletion): ArchitectureScopes {
  try {
    const message = completion.choices[0]?.message;
    const call = message?.tool_calls?.[0]?.function;
    if (call?.name === "submit_architecture_scopes") {
      const value = typeof call.arguments === "string" ? JSON.parse(call.arguments) : call.arguments;
      return architectureScopesSchema.parse(value);
    }
    if (!message?.content) throw new Error("Nugen did not return architecture scopes");
    const start = message.content.indexOf("{");
    const end = message.content.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error("Nugen returned incomplete architecture-scope JSON");
    return architectureScopesSchema.parse(JSON.parse(message.content.slice(start, end + 1)));
  } catch (error) {
    throw new ArchitectureScopesError(error instanceof Error ? error.message : "unknown architecture-scope format");
  }
}
