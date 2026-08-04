import { describe, expect, it } from "vitest";
import { createMockResult } from "@/lib/domainfit/mock-result";
import { defaultPlannerInput } from "@/lib/domainfit/schemas";
import { extractJsonObject, ModelOutputError, parseDomainFitResult } from "@/lib/nugen/model-output.server";
import { buildPlanPrompt } from "@/lib/domainfit/prompt";

const validResult = createMockResult({ ...defaultPlannerInput, use_case: "A valid architecture planning request", users: "Developers", domain: "Software" });

it("includes nested output types in the production prompt", () => {
  const prompt = buildPlanPrompt({ ...defaultPlannerInput, use_case: "A valid architecture planning request", users: "Developers", domain: "Software" });
  expect(prompt).toContain('"decision_factors": [{"factor": "string", "impact": "string"}]');
  expect(prompt).toContain('"human_review": {"required": true');
  expect(prompt).toContain('"benchmark_plan": [{"category": "string"');
});

describe("model output parsing", () => {
  it("extracts JSON from a fenced response", () => {
    expect(extractJsonObject(`\`\`\`json\n${JSON.stringify(validResult)}\n\`\`\``)).toEqual(validResult);
  });

  it("handles braces inside quoted strings", () => {
    expect(extractJsonObject('prefix {"message":"use {value}"} suffix')).toEqual({ message: "use {value}" });
  });

  it("returns a schema-valid DomainFit result", () => {
    expect(parseDomainFitResult(JSON.stringify(validResult))).toEqual(validResult);
  });

  it("rejects malformed JSON with useful repair feedback", () => {
    expect(() => parseDomainFitResult('{"recommended_architecture":')).toThrow(ModelOutputError);
    try { parseDomainFitResult('{"recommended_architecture":'); }
    catch (error) { expect((error as ModelOutputError).validationFeedback).toContain("complete JSON"); }
  });

  it("rejects structurally invalid model output", () => {
    expect(() => parseDomainFitResult('{"recommended_architecture":"always-align"}')).toThrow("schema validation");
  });
});
