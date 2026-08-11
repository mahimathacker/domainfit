import { z } from "zod";

function looksMeaningful(value: string, minimumWords: number): boolean {
  const text = value.trim();
  const words = text.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
  const letters = text.match(/[A-Za-z]/g) ?? [];
  if (words.length < minimumWords || /([a-z])\1{3,}/i.test(text)) return false;
  if (letters.length >= 6 && !/[aeiouy]/i.test(text)) return false;
  return true;
}

const meaningfulRequired = (minimumLength: number, maximumLength: number, minimumWords: number, message: string) =>
  z.string().min(minimumLength, message).max(maximumLength).refine(value => looksMeaningful(value, minimumWords), message);

const meaningfulOptional = (maximumLength: number, minimumWords: number, message: string) =>
  z.string().max(maximumLength).refine(value => !value.trim() || looksMeaningful(value, minimumWords), message);

export const plannerSchema = z.object({
  use_case: meaningfulRequired(20, 2000, 5, "Describe a real use case in at least five words."),
  users: meaningfulRequired(4, 500, 1, "Name the people who will use the system."),
  domain: meaningfulRequired(3, 200, 1, "Enter a meaningful domain name."),
  stable_behaviour: meaningfulOptional(2000, 3, "Describe the stable behaviour in at least three words, or leave it blank."),
  changing_facts: meaningfulOptional(2000, 3, "Describe changing information in at least three words, or leave it blank."),
  citations_required: z.boolean(),
  live_private_data: z.boolean(),
  external_actions: z.boolean(),
  mistake_impact: z.enum(["low", "medium", "high", "critical"]),
  human_approval: z.boolean(),
  available_documents: meaningfulOptional(3000, 4, "Describe the available material in at least four words, or leave it blank."),
  document_change_frequency: z.enum(["rarely", "quarterly", "monthly", "weekly", "daily"]),
  latency_requirements: meaningfulRequired(5, 500, 3, "Describe the expected response-time requirement."),
  usage_requirements: meaningfulRequired(5, 500, 3, "Describe the expected usage volume."),
});

export type PlannerInput = z.infer<typeof plannerSchema>;

const stringList = z.array(z.string());
export const domainFitResultSchema = z.object({
  recommended_architecture: z.enum(["general_model", "alignment", "rag", "tools", "hybrid"]),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1),
  assumptions: stringList,
  decision_factors: z.array(z.object({ factor: z.string(), impact: z.string() })),
  alignment_scope: stringList,
  runtime_retrieval_scope: stringList,
  tool_scope: stringList,
  deterministic_logic: stringList,
  human_review: z.object({ required: z.boolean(), reasons: stringList }),
  document_readiness: z.object({
    score: z.number().int().min(0).max(100),
    strengths: stringList,
    gaps: stringList,
    recommended_documents: stringList,
  }),
  benchmark_plan: z.array(z.object({
    category: z.string(),
    question: z.string(),
    expected_answer: z.string(),
    rationale: z.string(),
  })).min(1),
  implementation_steps: stringList,
  risks: stringList,
  limitations: stringList,
}).strict();

export type DomainFitResult = z.infer<typeof domainFitResultSchema>;

export const defaultPlannerInput: PlannerInput = {
  use_case: "",
  users: "",
  domain: "",
  stable_behaviour: "",
  changing_facts: "",
  citations_required: false,
  live_private_data: false,
  external_actions: false,
  mistake_impact: "medium",
  human_approval: false,
  available_documents: "",
  document_change_frequency: "quarterly",
  latency_requirements: "Interactive response under five seconds",
  usage_requirements: "Pilot usage with fewer than 1,000 requests per month",
};
