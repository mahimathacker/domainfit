import { describe, expect, it } from "vitest";
import { parseArchitectureDecision } from "@/lib/domainfit/architecture-decision.server";

describe("parseArchitectureDecision", () => {
  it("accepts validated JSON content when Nugen omits the tool call", () => {
    const decision = parseArchitectureDecision({ choices: [{ message: { role: "assistant", content: '{"recommended_architecture":"hybrid","reason":"The scenario combines stable behavior, current evidence, and actions."}', tool_calls: null } }] });
    expect(decision.recommended_architecture).toBe("hybrid");
  });

  it("accepts validated function arguments", () => {
    const decision = parseArchitectureDecision({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ function: { name: "submit_domainfit_decision", arguments: '{"recommended_architecture":"tools","reason":"Private data and actions require authenticated tools."}' } }] } }] });
    expect(decision.recommended_architecture).toBe("tools");
  });

  it("rejects unsupported labels", () => {
    expect(() => parseArchitectureDecision({ choices: [{ message: { content: '{"recommended_architecture":"always-align","reason":"This label is unsupported."}' } }] })).toThrow();
  });
});
