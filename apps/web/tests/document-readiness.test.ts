import { describe, expect, it } from "vitest";
import { buildDocumentReadinessMessages, DocumentReadinessError, parseDocumentReadiness } from "@/lib/domainfit/document-readiness.server";
import { defaultPlannerInput } from "@/lib/domainfit/schemas";

describe("document readiness", () => {
  it("passes the listed documents and alignment scope to Nugen", () => {
    const messages = buildDocumentReadinessMessages(
      { ...defaultPlannerInput, use_case: "Triage developer support tickets", available_documents: "Reviewed ticket taxonomy and escalation policy" },
      { recommended_architecture: "alignment", reason: "Stable triage behavior is required." },
      { alignment_scope: ["Apply the support taxonomy"], runtime_retrieval_scope: [], tool_scope: [], deterministic_logic: ["Validate ticket IDs"] },
    );
    expect(messages[1].content).toContain("Reviewed ticket taxonomy");
    expect(messages[1].content).toContain("Apply the support taxonomy");
  });

  it("validates a bounded readiness assessment", () => {
    const readiness = parseDocumentReadiness({ choices: [{ message: { content: JSON.stringify({
      score: 62,
      strengths: ["A reviewed escalation policy is available"],
      gaps: ["Representative edge cases are not listed"],
      recommended_documents: ["Reviewed edge-case ticket examples"],
    }) } }] });
    expect(readiness.score).toBe(62);
  });

  it("rejects scores outside the readiness scale", () => {
    expect(() => parseDocumentReadiness({ choices: [{ message: { content: JSON.stringify({ score: 120, strengths: [], gaps: ["Missing examples"], recommended_documents: ["Examples"] }) } }] })).toThrow(DocumentReadinessError);
  });
});
