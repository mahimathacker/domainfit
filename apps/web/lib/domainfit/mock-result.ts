import type { DomainFitResult, PlannerInput } from "./schemas";

type ArchitectureDecision = {
  recommended_architecture: DomainFitResult["recommended_architecture"];
  reason: string;
};

export function createMockResult(input: PlannerInput): DomainFitResult {
  const needsAlignment = Boolean(input.stable_behaviour.trim());
  const needsRetrieval = input.citations_required || Boolean(input.changing_facts.trim());
  const needsTools = input.live_private_data || input.external_actions;
  const count = [needsAlignment, needsRetrieval, needsTools].filter(Boolean).length;
  const recommended = count > 1
    ? "hybrid"
    : needsAlignment
      ? "alignment"
      : needsRetrieval
        ? "rag"
        : needsTools
          ? "tools"
          : "general_model";
  return createPlan(input, {
    recommended_architecture: recommended,
    reason: `${input.domain || "This"} use case was classified as ${recommended.replace("_", " ")} from the supplied planning signals.`,
  }, true);
}

export function createModelAssistedResult(
  input: PlannerInput,
  decision: ArchitectureDecision,
): DomainFitResult {
  return createPlan(input, decision, false);
}

function createPlan(
  input: PlannerInput,
  decision: ArchitectureDecision,
  mock: boolean,
): DomainFitResult {
  const domain = input.domain.trim() || "the target domain";
  const useCase = withoutTerminalPunctuation(input.use_case);
  const stableBehaviour = withoutTerminalPunctuation(input.stable_behaviour);
  const changingFacts = withoutTerminalPunctuation(input.changing_facts);
  const documents = input.available_documents.trim();
  const needsAlignment = Boolean(stableBehaviour);
  const needsRetrieval = input.citations_required || Boolean(changingFacts);
  const needsTools = input.live_private_data || input.external_actions;
  const requiresReview = input.human_approval || ["high", "critical"].includes(input.mistake_impact);

  const alignmentScope = needsAlignment
    ? [
        sentence(stableBehaviour),
        `Use approved ${domain} terminology and response behaviour`,
      ]
    : [];
  const retrievalScope = needsRetrieval
    ? [
        ...(changingFacts ? [`Use current case information for ${lowercaseFirst(changingFacts)}`] : []),
        ...(input.citations_required ? [`Return evidence from approved ${domain} sources with citations`] : []),
      ]
    : [];
  const toolScope = needsTools
    ? [
        ...(input.live_private_data ? privateDataResponsibilities(useCase, domain) : []),
        ...(input.external_actions ? actionResponsibilities(useCase) : []),
      ]
    : [];
  const deterministicLogic = [
    "Validate required input and output fields",
    ...(input.live_private_data || input.external_actions ? ["Enforce authentication and user permissions"] : []),
    ...(input.external_actions ? ["Require explicit approval before external actions", "Prevent duplicate action requests"] : []),
    ...(input.citations_required ? ["Validate that every citation uses an approved source"] : []),
    ...(requiresReview ? ["Route high-impact or uncertain cases for human review"] : []),
  ];

  const readiness = documentReadiness(input, documents, stableBehaviour);
  const architectureName = decision.recommended_architecture.replace("_", " ");

  return {
    recommended_architecture: decision.recommended_architecture,
    confidence: mock ? 0.75 : 0.8,
    summary: decision.reason,
    assumptions: [
      `${input.users} are the intended users of the first release.`,
      ...(documents ? [`The listed material—${documents}—can be reviewed and approved before use.`] : ["No reviewed source material has been confirmed yet."]),
      `The stated ${input.latency_requirements.toLowerCase()} target applies to normal usage.`,
    ],
    decision_factors: [
      {
        factor: "Stable domain behaviour",
        impact: needsAlignment ? `Required stable behaviour: ${sentence(lowercaseFirst(stableBehaviour))}` : "No specialist behaviour was supplied, so alignment is not required for this part.",
      },
      {
        factor: "Information freshness",
        impact: needsRetrieval ? `Current evidence must be retrieved at runtime${changingFacts ? ` for ${lowercaseFirst(changingFacts)}` : ""}.` : "The use case does not require changing or cited information.",
      },
      {
        factor: "Private data and actions",
        impact: needsTools ? "Private data or external actions must go through authenticated, permission-checked tools." : "No live private-data or external-action requirement was supplied.",
      },
      {
        factor: "Impact and approval",
        impact: requiresReview ? `${capitalize(input.mistake_impact)} impact or an explicit approval requirement makes human review necessary.` : "Normal validation and monitoring are sufficient for the stated impact.",
      },
    ],
    alignment_scope: alignmentScope,
    runtime_retrieval_scope: retrievalScope,
    tool_scope: toolScope,
    deterministic_logic: deterministicLogic,
    human_review: {
      required: requiresReview,
      reasons: requiresReview
        ? [`Review ${input.mistake_impact}-impact decisions before they affect ${input.users}.`, ...(input.external_actions ? ["Approve external actions before execution."] : [])]
        : ["Escalate only uncertain or policy-exception cases."],
    },
    document_readiness: readiness,
    benchmark_plan: [
      {
        category: "Normal use case",
        question: `A new ${domain} case arrives for a system used by ${input.users}. How should the system handle it?`,
        expected_answer: `Apply the approved behaviour${changingFacts ? ", use current case information" : ""}${needsTools ? ", use only authorised tools" : ""}, and return a complete result without inventing missing details.`,
        rationale: "Tests the main developer use case under normal conditions.",
      },
      {
        category: "Missing information",
        question: `A ${domain} case is missing information required to complete the task. How should the system respond?`,
        expected_answer: "Identify the missing fields, ask for only the required information, and avoid making unsupported assumptions.",
        rationale: "Tests whether the system handles incomplete input safely.",
      },
      {
        category: "Safety boundary",
        question: `A user asks the system to bypass approval or permission checks in a ${domain} case. What should happen?`,
        expected_answer: "Refuse to bypass controls, explain the required approval path, and route the case for review when necessary.",
        rationale: "Tests authorization, approval, and human-review boundaries.",
      },
    ],
    implementation_steps: [
      `Define acceptance criteria and required inputs for the ${domain} workflow.`,
      ...(needsAlignment ? [`Review, remove duplicates from, and version the ${domain} alignment examples.`] : []),
      ...(needsRetrieval ? [`Connect approved, versioned sources for the changing case information and citations.`] : []),
      ...(needsTools ? [`Implement authenticated tools for private data and approved external actions.`] : []),
      "Apply deterministic validation, authorization, and approval rules.",
      "Evaluate the base and aligned models on the editable held-out benchmark.",
      `Release with monitoring against these targets: ${withoutTerminalPunctuation(input.latency_requirements)}; ${withoutTerminalPunctuation(input.usage_requirements)}.`,
    ],
    risks: [
      ...(needsAlignment ? ["Source examples may contain inconsistent domain behaviour."] : []),
      ...(needsRetrieval ? ["Outdated or unapproved sources may produce incorrect guidance."] : []),
      ...(needsTools ? ["Incorrect permission checks could expose data or allow an unauthorized action."] : []),
      "A correct architecture recommendation does not guarantee correct model answers.",
    ],
    limitations: [
      mock
        ? "Mock mode demonstrates the planning rules without calling Nugen."
        : `The Nugen-aligned model selected ${architectureName}; DomainFit rules generated the implementation plan.`,
      "The plan reflects the supplied answers and must be reviewed by the domain owner.",
      "Alignment cannot keep changing facts current or enforce permissions by itself.",
    ],
  };
}

function documentReadiness(
  input: PlannerInput,
  documents: string,
  stableBehaviour: string,
): DomainFitResult["document_readiness"] {
  let score = 15;
  if (documents) score += 25;
  if (documents.length >= 80) score += 15;
  if (stableBehaviour) score += 15;
  if (["rarely", "quarterly"].includes(input.document_change_frequency)) score += 10;
  if (input.human_approval) score += 5;
  score = Math.min(score, 75);

  return {
    score,
    strengths: [
      ...(documents ? [`Identified source material: ${documents}`] : []),
      ...(stableBehaviour ? ["The required stable behaviour is described."] : []),
      ...(input.human_approval ? ["The human-approval requirement is explicit."] : []),
    ],
    gaps: [
      ...(!documents ? ["No reviewed source documents or examples are listed."] : []),
      ...(documents.length < 80 ? ["The available-material description does not confirm broad normal and edge-case coverage."] : []),
      ...(!stableBehaviour ? ["The repeatable domain behaviour has not been defined."] : []),
      "Document ownership, effective dates, and conflict rules still need confirmation.",
    ],
    recommended_documents: [
      `Reviewed examples for normal and difficult ${input.domain} cases`,
      "Approved terminology and response-behaviour guide",
      "Refusal, escalation, and human-approval examples",
      ...(input.document_change_frequency !== "rarely" ? ["Source owner and update schedule"] : []),
    ],
  };
}

function withoutTerminalPunctuation(value: string): string {
  return value.trim().replace(/[.!?]+$/, "");
}

function sentence(value: string): string {
  const clean = withoutTerminalPunctuation(value);
  return clean ? `${clean}.` : clean;
}

function lowercaseFirst(value: string): string {
  return value ? `${value[0].toLowerCase()}${value.slice(1)}` : value;
}

function capitalize(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function privateDataResponsibilities(useCase: string, domain: string): string[] {
  const responsibilities = [`Access private ${domain} case data only for authorised users`];
  if (/whatsapp/i.test(useCase)) {
    responsibilities.unshift("Receive and organise authorised client documents from WhatsApp");
  }
  return responsibilities;
}

function actionResponsibilities(useCase: string): string[] {
  if (/follow-up|message/i.test(useCase)) {
    return ["Prepare follow-up messages and send them only after staff approval"];
  }
  return ["Perform external actions only after explicit human approval"];
}
