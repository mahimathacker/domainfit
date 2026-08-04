import { z } from "zod";
import type { PlannerInput } from "./schemas";
import type { ArchitectureDecision } from "./architecture-decision.server";
import type { ArchitectureScopes } from "./architecture-scopes.server";
import type { NugenCompletion } from "@/lib/nugen/types";

const readinessItem = z.string().min(3).max(180);

export const documentReadinessSchema = z.object({
  score: z.number().int().min(0).max(100),
  strengths: z.array(readinessItem).max(5),
  gaps: z.array(readinessItem).min(1).max(5),
  recommended_documents: z.array(readinessItem).min(1).max(5),
}).strict();

export type DocumentReadiness = z.infer<typeof documentReadinessSchema>;

export class DocumentReadinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentReadinessError";
  }
}

export const documentReadinessTool = {
  type: "function",
  function: {
    name: "submit_document_readiness",
    description: "Submit a grounded assessment of the use case's alignment-document readiness.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        score: { type: "integer", minimum: 0, maximum: 100 },
        strengths: { type: "array", maxItems: 5, items: { type: "string" } },
        gaps: { type: "array", minItems: 1, maxItems: 5, items: { type: "string" } },
        recommended_documents: { type: "array", minItems: 1, maxItems: 5, items: { type: "string" } },
      },
      required: ["score", "strengths", "gaps", "recommended_documents"],
    },
  },
};

export function buildDocumentReadinessMessages(
  input: PlannerInput,
  decision: ArchitectureDecision,
  scopes: ArchitectureScopes,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  return [
    {
      role: "system",
      content: "You are DomainFit. Assess whether the described source material is ready for domain alignment. Ground every strength, gap, and recommendation in the supplied use case. Do not claim a document exists unless it is listed. Score conservatively: 0-30 means little usable material, 31-60 means partial coverage, 61-80 means useful but incomplete, and 81-100 requires reviewed representative examples, edge cases, ownership, and versioning. Return only the requested JSON object.",
    },
    {
      role: "user",
      content: JSON.stringify({
        architecture: decision.recommended_architecture,
        use_case: input.use_case,
        domain: input.domain,
        stable_behaviour: input.stable_behaviour,
        available_documents: input.available_documents,
        document_change_frequency: input.document_change_frequency,
        alignment_scope: scopes.alignment_scope,
        mistake_impact: input.mistake_impact,
      }),
    },
  ];
}

export function parseDocumentReadiness(completion: NugenCompletion): DocumentReadiness {
  try {
    const message = completion.choices[0]?.message;
    const call = message?.tool_calls?.[0]?.function;
    if (call?.name === "submit_document_readiness") {
      const value = typeof call.arguments === "string" ? JSON.parse(call.arguments) : call.arguments;
      return documentReadinessSchema.parse(value);
    }
    if (!message?.content) throw new Error("Nugen did not return document readiness");
    const start = message.content.indexOf("{");
    const end = message.content.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error("Nugen returned incomplete document-readiness JSON");
    return documentReadinessSchema.parse(JSON.parse(message.content.slice(start, end + 1)));
  } catch (error) {
    throw new DocumentReadinessError(error instanceof Error ? error.message : "unknown document-readiness format");
  }
}
