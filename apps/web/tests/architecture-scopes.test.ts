import { describe, expect, it } from "vitest";
import { ArchitectureScopesError, buildArchitectureScopesMessages, parseArchitectureScopes } from "@/lib/domainfit/architecture-scopes.server";
import { defaultPlannerInput } from "@/lib/domainfit/schemas";

describe("architecture scopes", () => {
  it("includes the developer use case in the bounded task", () => {
    const messages = buildArchitectureScopesMessages(
      { ...defaultPlannerInput, use_case: "Triage developer API support tickets", users: "Support engineers", domain: "Developer infrastructure" },
      { recommended_architecture: "hybrid", reason: "The use case combines stable behavior and current evidence." },
    );
    expect(messages.at(-1)?.content).toContain("Triage developer API support tickets");
  });

  it("accepts validated scope JSON when tool calling is omitted", () => {
    const scopes = parseArchitectureScopes({ choices: [{ message: { content: JSON.stringify({
      alignment_scope: ["Apply the approved support taxonomy"],
      runtime_retrieval_scope: ["Retrieve current API documentation"],
      tool_scope: [],
      deterministic_logic: ["Validate ticket identifiers"],
    }) } }] });
    expect(scopes.runtime_retrieval_scope).toEqual(["Retrieve current API documentation"]);
  });

  it("rejects incomplete scope output", () => {
    expect(() => parseArchitectureScopes({ choices: [{ message: { content: '{"alignment_scope":[]' } }] })).toThrow(ArchitectureScopesError);
  });
});
