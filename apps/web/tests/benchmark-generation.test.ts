import { describe, expect, it } from "vitest";
import { BenchmarkGenerationError, buildBenchmarkGenerationMessages, parseBenchmarkGeneration } from "@/lib/domainfit/benchmark-generation.server";
import { defaultPlannerInput } from "@/lib/domainfit/schemas";

const item = (category: string) => ({
  category,
  question: `How should the assistant handle this ${category} developer ticket?`,
  expected_answer: `The response follows observable ${category} requirements for this use case.`,
  rationale: `This verifies the model's ${category} behavior on unseen input.`,
});

describe("benchmark generation", () => {
  it("grounds the benchmark task in the submitted use case and gaps", () => {
    const messages = buildBenchmarkGenerationMessages(
      { ...defaultPlannerInput, use_case: "Triage developer API support tickets", users: "Support engineers", domain: "Developer infrastructure" },
      { recommended_architecture: "hybrid", reason: "Multiple layers are required." },
      { alignment_scope: ["Apply taxonomy"], runtime_retrieval_scope: ["Retrieve API docs"], tool_scope: [], deterministic_logic: ["Validate IDs"] },
      { score: 50, strengths: [], gaps: ["No adversarial examples"], recommended_documents: ["Reviewed adversarial cases"] },
    );
    expect(messages[1].content).toContain("Triage developer API support tickets");
    expect(messages[1].content).toContain("No adversarial examples");
  });

  it("validates exactly three or more bounded scenarios", () => {
    const result = parseBenchmarkGeneration({ choices: [{ message: { content: JSON.stringify({ benchmark_plan: [item("normal"), item("ambiguity"), item("safety")] }) } }] });
    expect(result.benchmark_plan).toHaveLength(3);
  });

  it("rejects an undersized benchmark", () => {
    expect(() => parseBenchmarkGeneration({ choices: [{ message: { content: JSON.stringify({ benchmark_plan: [item("normal")] }) } }] })).toThrow(BenchmarkGenerationError);
  });
});
