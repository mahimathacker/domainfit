import { z } from "zod";
import type { PlannerInput } from "./schemas";
import type { ArchitectureDecision } from "./architecture-decision.server";
import type { ArchitectureScopes } from "./architecture-scopes.server";
import type { DocumentReadiness } from "./document-readiness.server";
import type { NugenCompletion } from "@/lib/nugen/types";

const benchmarkItemSchema = z.object({
  category: z.string().min(3).max(80),
  question: z.string().min(10).max(300),
  expected_answer: z.string().min(10).max(400),
  rationale: z.string().min(10).max(240),
}).strict();

export const benchmarkGenerationSchema = z.object({
  benchmark_plan: z.array(benchmarkItemSchema).min(3).max(5),
}).strict();

export type BenchmarkGeneration = z.infer<typeof benchmarkGenerationSchema>;

export class BenchmarkGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BenchmarkGenerationError";
  }
}

export const benchmarkGenerationTool = {
  type: "function",
  function: {
    name: "submit_benchmark_plan",
    description: "Submit a compact held-out evaluation plan for the supplied developer use case.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        benchmark_plan: {
          type: "array",
          minItems: 3,
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              category: { type: "string" },
              question: { type: "string" },
              expected_answer: { type: "string" },
              rationale: { type: "string" },
            },
            required: ["category", "question", "expected_answer", "rationale"],
          },
        },
      },
      required: ["benchmark_plan"],
    },
  },
};

export function buildBenchmarkGenerationMessages(
  input: PlannerInput,
  decision: ArchitectureDecision,
  scopes: ArchitectureScopes,
  readiness: DocumentReadiness,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  return [
    {
      role: "system",
      content: "You are DomainFit. Create exactly three concise held-out benchmark scenarios for the supplied developer use case. Each question must be a realistic model input, not a generic architecture interview question. Cover: one normal case, one ambiguity or missing-information case, and one safety or boundary case. Expected answers must state observable pass criteria without copying source text. Do not use training examples verbatim. Return only the requested JSON object.",
    },
    {
      role: "user",
      content: JSON.stringify({
        architecture: decision.recommended_architecture,
        use_case: input.use_case,
        users: input.users,
        domain: input.domain,
        stable_behaviour: input.stable_behaviour,
        changing_facts: input.changing_facts,
        citations_required: input.citations_required,
        private_data: input.live_private_data,
        external_actions: input.external_actions,
        mistake_impact: input.mistake_impact,
        human_approval: input.human_approval,
        scopes,
        document_gaps: readiness.gaps,
      }),
    },
  ];
}

export function parseBenchmarkGeneration(completion: NugenCompletion): BenchmarkGeneration {
  try {
    const message = completion.choices[0]?.message;
    const call = message?.tool_calls?.[0]?.function;
    if (call?.name === "submit_benchmark_plan") {
      const value = typeof call.arguments === "string" ? JSON.parse(call.arguments) : call.arguments;
      return benchmarkGenerationSchema.parse(value);
    }
    if (!message?.content) throw new Error("Nugen did not return a benchmark plan");
    const start = message.content.indexOf("{");
    const end = message.content.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error("Nugen returned incomplete benchmark JSON");
    return benchmarkGenerationSchema.parse(JSON.parse(message.content.slice(start, end + 1)));
  } catch (error) {
    throw new BenchmarkGenerationError(error instanceof Error ? error.message : "unknown benchmark format");
  }
}
