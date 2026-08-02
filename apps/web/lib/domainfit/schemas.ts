import { z } from "zod";

export const plannerSchema = z.object({
  use_case: z.string().min(10, "Describe the use case in at least 10 characters.").max(2000),
  users: z.string().min(2, "Tell us who will use it.").max(500),
  domain: z.string().min(2, "Enter a domain.").max(200),
  stable_behaviour: z.string().max(2000),
  changing_facts: z.string().max(2000),
  citations_required: z.boolean(),
  live_private_data: z.boolean(),
  external_actions: z.boolean(),
  mistake_impact: z.enum(["low", "medium", "high", "critical"]),
  human_approval: z.boolean(),
  available_documents: z.string().max(3000),
  document_change_frequency: z.enum(["rarely", "quarterly", "monthly", "weekly", "daily"]),
  latency_requirements: z.string().max(500),
  usage_requirements: z.string().max(500),
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

