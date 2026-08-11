import { describe, expect, it } from "vitest";
import { createMockResult, createModelAssistedResult } from "@/lib/domainfit/mock-result";
import { defaultPlannerInput, domainFitResultSchema } from "@/lib/domainfit/schemas";

describe("domainFitResultSchema", () => {
  it("validates the mock result contract", () => {
    const result = createMockResult({ ...defaultPlannerInput, use_case: "A valid support planner", users: "Developers", domain: "Support" });
    expect(domainFitResultSchema.parse(result).recommended_architecture).toBe("general_model");
  });

  it("rejects unknown fields and invalid confidence", () => {
    const result = createMockResult({ ...defaultPlannerInput, use_case: "A valid support planner", users: "Developers", domain: "Support" });
    expect(domainFitResultSchema.safeParse({ ...result, confidence: 4, invented: true }).success).toBe(false);
  });

  it("renders hybrid when multiple architecture signals are present", () => {
    const result = createMockResult({
      ...defaultPlannerInput,
      use_case: "A support assistant for private customer records",
      users: "Support engineers",
      domain: "Customer support",
      stable_behaviour: "Follow the approved escalation and response structure every time.",
      changing_facts: "Product policy and account entitlements change frequently.",
      available_documents: "Reviewed escalation policies and representative response examples are available.",
      live_private_data: true,
    });
    expect(result.recommended_architecture).toBe("hybrid");
  });

  it("constructs a complete plan from a focused aligned decision", () => {
    const input = { ...defaultPlannerInput, use_case: "A valid support planner", users: "Support", domain: "Support" };
    const result = createModelAssistedResult(input, { recommended_architecture: "hybrid", reason: "The use case combines stable behavior, current evidence, and tools." });
    expect(domainFitResultSchema.parse(result).recommended_architecture).toBe("hybrid");
    expect(result.summary).toContain("combines stable behavior");
  });

  it("turns developer inputs into a use-case-specific deterministic plan", () => {
    const input = {
      ...defaultPlannerInput,
      use_case: "Organise CA client documents and send approved follow-ups",
      users: "CA firm staff",
      domain: "CA document operations",
      stable_behaviour: "Apply the approved document checklist",
      changing_facts: "Client files and filing-year information",
      available_documents: "Approved checklist and reviewed follow-up examples",
      live_private_data: true,
      external_actions: true,
      human_approval: true,
    };
    const result = createModelAssistedResult(input, {
      recommended_architecture: "hybrid",
      reason: "The use case combines stable domain behavior with changing case data.",
    });
    expect(result.alignment_scope.join(" ")).toContain("approved document checklist");
    expect(result.runtime_retrieval_scope.join(" ")).toContain("filing-year information");
    expect(result.tool_scope.join(" ")).toContain("approved external actions");
    expect(result.deterministic_logic).toContain("Require explicit approval before external actions");
    expect(result.benchmark_plan[0].question).toContain("Organise CA client documents");
  });
});
