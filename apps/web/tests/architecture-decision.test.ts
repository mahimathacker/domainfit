import { describe, expect, it } from "vitest";
import { ArchitectureDecisionError, buildArchitectureDecisionMessages, parseArchitectureDecision } from "@/lib/domainfit/architecture-decision.server";
import { defaultPlannerInput } from "@/lib/domainfit/schemas";

describe("parseArchitectureDecision", () => {
  it("reduces planner input to explicit architecture signals", () => {
    const messages = buildArchitectureDecisionMessages({
      ...defaultPlannerInput,
      use_case: "A support assistant for current private account information",
      users: "Support",
      domain: "Support",
      changing_facts: "Account state changes continuously",
      live_private_data: true,
    });
    expect(messages.at(-1)?.content).toContain("changing_or_cited_evidence=true");
    expect(messages.at(-1)?.content).toContain("private_data_or_external_actions=true");
  });

  it("accepts a validated label when Nugen omits the tool call", () => {
    const decision = parseArchitectureDecision({ choices: [{ message: { role: "assistant", content: "hybrid", tool_calls: null } }] }, defaultPlannerInput);
    expect(decision.recommended_architecture).toBe("hybrid");
  });

  it("recovers a label from the legacy response even when its reason is truncated", () => {
    const decision = parseArchitectureDecision({ choices: [{ message: { content: '{"recommended_architecture":"general_model","reason":"repeating' } }] }, defaultPlannerInput);
    expect(decision.recommended_architecture).toBe("general_model");
  });

  it("accepts validated function arguments", () => {
    const decision = parseArchitectureDecision({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ function: { name: "submit_domainfit_decision", arguments: '{"recommended_architecture":"tools"}' } }] } }] }, defaultPlannerInput);
    expect(decision.recommended_architecture).toBe("tools");
  });

  it("rejects unsupported labels", () => {
    expect(() => parseArchitectureDecision({ choices: [{ message: { content: "always-align" } }] }, defaultPlannerInput)).toThrow(ArchitectureDecisionError);
  });
});
