import type { DomainFitResult, PlannerInput } from "./schemas";
import type { ArchitectureScopes } from "./architecture-scopes.server";

export function createMockResult(input: PlannerInput): DomainFitResult {
  const needsRuntime = input.citations_required || input.changing_facts.length > 20;
  const needsTools = input.live_private_data || input.external_actions;
  const needsAlignment = input.stable_behaviour.length > 20 && input.available_documents.length > 20;
  const count = [needsRuntime, needsTools, needsAlignment].filter(Boolean).length;
  const recommended = count > 1 ? "hybrid" : needsAlignment ? "alignment" : needsRuntime ? "rag" : needsTools ? "tools" : "general_model";

  return createResult(input, recommended, `${input.domain || "This"} use case benefits from a ${recommended.replace("_", " ")} architecture that keeps stable behaviour separate from changing facts and controlled actions.`, 0.86, true);
}

export function createModelAssistedResult(
  input: PlannerInput,
  decision: { recommended_architecture: DomainFitResult["recommended_architecture"]; reason: string },
  scopes?: ArchitectureScopes,
): DomainFitResult {
  const result = createResult(input, decision.recommended_architecture, decision.reason, 0.8, false);
  return scopes ? { ...result, ...scopes } : result;
}

function createResult(input: PlannerInput, recommended: DomainFitResult["recommended_architecture"], summary: string, confidence: number, mock: boolean): DomainFitResult {
  const needsRuntime = input.citations_required || input.changing_facts.length > 20;
  const needsTools = input.live_private_data || input.external_actions;
  const needsAlignment = input.stable_behaviour.length > 20 && input.available_documents.length > 20;

  return {
    recommended_architecture: recommended,
    confidence,
    summary,
    assumptions: ["Available documents are approved for model development.", "The first release is an advisory workflow, not an autonomous decision-maker."],
    decision_factors: [
      { factor: "Behaviour stability", impact: needsAlignment ? "Repeated domain behaviour supports alignment." : "Prompting is sufficient until repeatable behaviour is better defined." },
      { factor: "Information freshness", impact: needsRuntime ? "Changing or cited facts should be retrieved at runtime." : "The scenario does not currently require a retrieval layer." },
      { factor: "Controlled actions", impact: needsTools ? "Private data and actions require authenticated tools." : "No external action path is required." },
    ],
    alignment_scope: needsAlignment ? ["Domain terminology and response structure", "Consistent escalation and uncertainty behaviour"] : [],
    runtime_retrieval_scope: needsRuntime ? ["Frequently changing facts", "Approved sources and citation metadata"] : [],
    tool_scope: needsTools ? ["Authenticated private-data lookup", "Permission-checked external actions"] : [],
    deterministic_logic: ["Input and output schema validation", "Permission checks", "Required human approval gates"],
    human_review: {
      required: input.human_approval || ["high", "critical"].includes(input.mistake_impact),
      reasons: ["Review decisions with material user impact and any low-confidence result."],
    },
    document_readiness: {
      score: input.available_documents.length > 80 ? 78 : 46,
      strengths: input.available_documents ? ["Relevant source material has been identified."] : [],
      gaps: ["Confirm document owners, effective dates, and precedence rules.", "Add representative edge-case examples."],
      recommended_documents: ["Approved terminology guide", "Escalation and refusal examples", "Common and adversarial scenario set"],
    },
    benchmark_plan: [
      { category: "Architecture selection", question: "Which parts of this use case require alignment, retrieval, or tools?", expected_answer: "Separates stable behaviour, changing evidence, and controlled actions with explicit rationale.", rationale: "Tests the core DomainFit decision." },
      { category: "Insufficient information", question: "What assumptions must be confirmed before implementation?", expected_answer: "Names missing governance, document quality, risk, freshness, and permission details.", rationale: "Rewards calibrated uncertainty rather than invention." },
      { category: "Safety boundary", question: "Which decisions must remain deterministic or human-reviewed?", expected_answer: "Keeps authorization, calculations, validation, and high-impact approval outside model discretion.", rationale: "Tests production safety boundaries." },
    ],
    implementation_steps: ["Confirm requirements and success metrics.", "Prepare and review stable alignment material.", "Create an alignment and a separate held-out benchmark.", "Deploy behind server-only inference routes.", "Compare base and aligned models on identical scenarios."],
    risks: ["Source documents may encode conflicting guidance.", "A correct architecture recommendation does not guarantee safe implementation."],
    limitations: [mock ? "Mock mode demonstrates the product flow without claiming real model performance." : "The aligned model selected the architecture; deterministic application logic constructed the detailed plan.", "Final recommendations require review by the domain owner."],
  };
}
