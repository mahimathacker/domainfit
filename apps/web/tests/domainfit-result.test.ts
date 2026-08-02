import { describe, expect, it } from "vitest";
import { createMockResult } from "@/lib/domainfit/mock-result";
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
});

