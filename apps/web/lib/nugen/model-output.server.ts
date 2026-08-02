import { ZodError } from "zod";
import { domainFitResultSchema, type DomainFitResult } from "@/lib/domainfit/schemas";

export class ModelOutputError extends Error {
  constructor(message: string, readonly validationFeedback: string) {
    super(message);
    this.name = "ModelOutputError";
  }
}

export function extractJsonObject(text: string): unknown {
  const source = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = source.indexOf("{");
  if (start < 0) throw new ModelOutputError("The model did not return JSON", "Return one JSON object only.");
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(source.slice(start, index + 1)); }
        catch { throw new ModelOutputError("The model returned malformed JSON", "Return syntactically valid JSON with escaped string values."); }
      }
    }
  }
  throw new ModelOutputError("The model returned incomplete JSON", "Return a complete JSON object.");
}

export function parseDomainFitResult(text: string): DomainFitResult {
  try {
    return domainFitResultSchema.parse(extractJsonObject(text));
  } catch (error) {
    if (error instanceof ModelOutputError) throw error;
    if (error instanceof ZodError) {
      const feedback = error.issues.slice(0, 8).map(issue => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ");
      throw new ModelOutputError("The model response failed schema validation", feedback);
    }
    throw new ModelOutputError("The model response could not be parsed", "Return one valid JSON object matching every required field.");
  }
}
