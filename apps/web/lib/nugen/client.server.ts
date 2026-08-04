import "server-only";
import type { NugenCompletion } from "./types";

export class NugenServerError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "NugenServerError";
  }
}

export class NugenServerClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options?: { apiKey?: string; baseUrl?: string }) {
    this.apiKey = options?.apiKey ?? process.env.NUGEN_API_KEY ?? "";
    this.baseUrl = (options?.baseUrl ?? process.env.NUGEN_BASE_URL ?? "https://api.nugen.in").replace(/\/$/, "");
    if (!this.apiKey) throw new NugenServerError("NUGEN_API_KEY is not configured");
  }

  async complete(options: { model: string; prompt: string; maxTokens?: number; temperature?: number }): Promise<NugenCompletion> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(`${this.baseUrl}/api/v3/inference/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: options.model,
          prompt: options.prompt,
          max_tokens: options.maxTokens ?? 1800,
          temperature: options.temperature ?? 0.1,
          stream: false,
        }),
        cache: "no-store",
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = payload && typeof payload === "object" && "detail" in payload ? JSON.stringify(payload.detail) : `HTTP ${response.status}`;
        throw new NugenServerError(`Nugen request failed: ${detail}`, response.status);
      }
      if (!isCompletion(payload)) throw new NugenServerError("Nugen returned an unexpected completion response");
      return payload;
    } catch (error) {
      if (error instanceof NugenServerError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new NugenServerError("Nugen request timed out");
      throw new NugenServerError("Unable to reach Nugen");
    } finally {
      clearTimeout(timeout);
    }
  }

  async chatComplete(options: {
    model: string;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    maxTokens?: number;
    temperature?: number;
    tools?: Array<Record<string, unknown>>;
    toolChoice?: string | Record<string, unknown>;
  }): Promise<NugenCompletion> {
    return this.requestCompletion("/api/v3/inference/chat/completions", {
      model: options.model,
      messages: options.messages,
      max_tokens: options.maxTokens ?? 150,
      temperature: options.temperature ?? 0.2,
      stream: false,
      ...(options.tools ? { tools: options.tools } : {}),
      ...(options.toolChoice ? { tool_choice: options.toolChoice } : {}),
    });
  }

  private async requestCompletion(path: string, body: Record<string, unknown>): Promise<NugenCompletion> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = payload && typeof payload === "object" && "detail" in payload ? JSON.stringify(payload.detail) : `HTTP ${response.status}`;
        throw new NugenServerError(`Nugen request failed: ${detail}`, response.status);
      }
      if (!isCompletion(payload)) throw new NugenServerError("Nugen returned an unexpected completion response");
      return payload;
    } catch (error) {
      if (error instanceof NugenServerError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new NugenServerError("Nugen request timed out");
      throw new NugenServerError("Unable to reach Nugen");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function completionText(completion: NugenCompletion): string {
  const choice = completion.choices[0];
  return choice?.text ?? choice?.message?.content ?? "";
}

function isCompletion(value: unknown): value is NugenCompletion {
  return Boolean(value && typeof value === "object" && "choices" in value && Array.isArray(value.choices));
}
