import { describe, expect, it } from "vitest";
import { buildDeliveryPlanMessages, DeliveryPlanError, parseDeliveryPlan } from "@/lib/domainfit/delivery-plan.server";
import { defaultPlannerInput } from "@/lib/domainfit/schemas";

const validDeliveryPlan = {
  assumptions: ["Support engineers can review escalated tickets"],
  decision_factors: [
    { factor: "Ticket consistency", impact: "The assistant must apply the approved support taxonomy consistently." },
    { factor: "Documentation freshness", impact: "Current API guidance must be retrieved rather than learned during alignment." },
    { factor: "Customer impact", impact: "Account-changing recommendations require support-engineer approval." },
  ],
  implementation_steps: ["Approve the ticket taxonomy", "Connect current API documentation", "Evaluate held-out support tickets"],
  human_review: { required: true, reasons: ["Support engineers must approve account-impacting guidance"] },
  risks: ["Outdated API documentation may produce incorrect guidance", "Ambiguous tickets may be routed to the wrong queue"],
  limitations: ["The model cannot verify private account state without an authenticated tool"],
};

describe("delivery plan", () => {
  it("passes operating requirements and prior plan outputs to Nugen", () => {
    const messages = buildDeliveryPlanMessages(
      { ...defaultPlannerInput, use_case: "Triage developer API support tickets", human_approval: true },
      { recommended_architecture: "hybrid", reason: "Multiple layers are required." },
      { alignment_scope: ["Apply taxonomy"], runtime_retrieval_scope: ["Retrieve docs"], tool_scope: [], deterministic_logic: ["Validate IDs"] },
      { score: 55, strengths: [], gaps: ["Missing edge cases"], recommended_documents: ["Edge-case examples"] },
      { benchmark_plan: [{ category: "Safety", question: "How should an account-impacting ticket be handled?", expected_answer: "Escalate for approval before any action is taken.", rationale: "Tests the required approval boundary." }, { category: "Normal", question: "How should a routine API ticket be categorized?", expected_answer: "Apply the approved taxonomy and identify the relevant API area.", rationale: "Tests ordinary taxonomy application." }, { category: "Ambiguity", question: "How should an underspecified API failure be handled?", expected_answer: "Request the missing diagnostic details without inventing a cause.", rationale: "Tests behavior with missing information." }] },
    );
    expect(messages[1].content).toContain("Triage developer API support tickets");
    expect(messages[1].content).toContain("human_approval_required");
  });

  it("validates a complete bounded delivery plan", () => {
    expect(parseDeliveryPlan({ choices: [{ message: { content: JSON.stringify(validDeliveryPlan) } }] }).implementation_steps).toHaveLength(3);
  });

  it("rejects delivery plans without enough risks", () => {
    expect(() => parseDeliveryPlan({ choices: [{ message: { content: JSON.stringify({ ...validDeliveryPlan, risks: ["Only one risk is supplied"] }) } }] })).toThrow(DeliveryPlanError);
  });
});
