import { describe, expect, it } from "vitest";
import { defaultPlannerInput, plannerSchema } from "@/lib/domainfit/schemas";

describe("plannerSchema", () => {
  it("rejects placeholder and gibberish planning text", () => {
    const result = plannerSchema.safeParse({
      ...defaultPlannerInput,
      use_case: ".,,mmnvnvnvnnv........",
      users: "/nvvvv",
      domain: ".vvvv",
      stable_behaviour: "vvvv",
      changing_facts: "mmmm",
    });
    expect(result.success).toBe(false);
  });
  it("accepts a complete planner submission", () => {
    const result = plannerSchema.safeParse({
      ...defaultPlannerInput,
      use_case: "Build a support assistant for API customers.",
      users: "Support engineers",
      domain: "Developer tools",
    });
    expect(result.success).toBe(true);
  });

  it("accepts the complete CA-practice demo use case", () => {
    const result = plannerSchema.safeParse({
      ...defaultPlannerInput,
      use_case: "A CA-practice assistant that organises client financial documents received through WhatsApp, identifies missing documents for the applicable filing year, and prepares approved follow-up messages for CA staff to review and send.",
      users: "Chartered accountants and operations staff",
      domain: "CA practice operations",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an underspecified use case", () => {
    const result = plannerSchema.safeParse({ ...defaultPlannerInput, use_case: "chat", users: "", domain: "" });
    expect(result.success).toBe(false);
  });
});
