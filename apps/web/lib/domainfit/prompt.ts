import type { PlannerInput } from "./schemas";

export const DOMAINFIT_SYSTEM_PROMPT = `You are DomainFit, an architecture-planning assistant. Recommend the smallest architecture that meets the requirements. Do not recommend alignment by default. Separate stable behavior for alignment, changing evidence for retrieval, private or live data and actions for tools, and deterministic application logic. Identify assumptions and require human review for high-impact outcomes. Return only one JSON object matching the requested schema, with no markdown.`;

export const DOMAINFIT_OUTPUT_CONTRACT = `{
  "recommended_architecture": "general_model | alignment | rag | tools | hybrid",
  "confidence": 0.0,
  "summary": "string",
  "assumptions": ["string"],
  "decision_factors": [{"factor": "string", "impact": "string"}],
  "alignment_scope": ["string"],
  "runtime_retrieval_scope": ["string"],
  "tool_scope": ["string"],
  "deterministic_logic": ["string"],
  "human_review": {"required": true, "reasons": ["string"]},
  "document_readiness": {"score": 0, "strengths": ["string"], "gaps": ["string"], "recommended_documents": ["string"]},
  "benchmark_plan": [{"category": "string", "question": "string", "expected_answer": "string", "rationale": "string"}],
  "implementation_steps": ["string"],
  "risks": ["string"],
  "limitations": ["string"]
}`;

export function buildPlanPrompt(input: PlannerInput, correction?: string): string {
  return `${DOMAINFIT_SYSTEM_PROMPT}

Planner input:
${JSON.stringify(input, null, 2)}

Required output fields:
recommended_architecture, confidence, summary, assumptions, decision_factors, alignment_scope, runtime_retrieval_scope, tool_scope, deterministic_logic, human_review, document_readiness, benchmark_plan, implementation_steps, risks, limitations.

Required JSON shape (replace placeholder values, preserve every value type):
${DOMAINFIT_OUTPUT_CONTRACT}

Architecture must be one of: general_model, alignment, rag, tools, hybrid.
Confidence must be between 0 and 1. Document readiness score must be an integer from 0 to 100.
${correction ? `\nYour previous response was invalid. Correct it using this validation feedback:\n${correction}` : ""}`;
}

export function buildComparisonPrompt(scenario: string): string {
  return `${DOMAINFIT_SYSTEM_PROMPT}\n\nAnalyze this scenario. Explain the architecture recommendation, assumptions, alignment scope, runtime scope, tool scope, deterministic logic, human review, and benchmark approach.\n\nScenario:\n${scenario}`;
}
