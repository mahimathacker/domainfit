import { describe, expect, it } from "vitest";
import { defaultPlannerInput, plannerSchema } from "@/lib/domainfit/schemas";

describe("plannerSchema", () => {
  it("accepts a complete planner submission", () => {
    const result = plannerSchema.safeParse({
      ...defaultPlannerInput,
      use_case: "Build a support assistant for API customers.",
      users: "Support engineers",
      domain: "Developer tools",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an underspecified use case", () => {
    const result = plannerSchema.safeParse({ ...defaultPlannerInput, use_case: "chat", users: "", domain: "" });
    expect(result.success).toBe(false);
  });
});

