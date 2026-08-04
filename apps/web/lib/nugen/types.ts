export interface NugenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  [key: string]: unknown;
}

export interface NugenCompletion {
  id?: string;
  model?: string;
  choices: Array<{
    text?: string;
    message?: {
      content?: string | null;
      role?: string;
      tool_calls?: Array<{
        function?: { name?: string; arguments?: string | Record<string, unknown> };
      }> | null;
    };
  }>;
  usage?: NugenUsage;
}

export interface ModelResponse {
  model: string;
  content: string;
  latency_ms: number;
  usage?: NugenUsage;
  mode: "mock" | "live";
}
