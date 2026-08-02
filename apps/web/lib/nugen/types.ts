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
    message?: { content?: string; role?: string };
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

