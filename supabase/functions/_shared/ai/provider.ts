// Provider-agnostic AI interface. Both Anthropic and OpenAI adapters map to this.

export type Role = "user" | "assistant" | "tool";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    };

export type Message = { role: Role; content: string | ContentBlock[] };

export type Tool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type CompletionRequest = {
  system: string;
  messages: Message[];
  tools?: Tool[];
  maxTokens: number;
  temperature: number;
};

export type CompletionResponse = {
  blocks: ContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens";
  inputTokens: number;
  outputTokens: number;
};

export type ProviderConfig = {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  baseURL?: string;
};

export interface AiProvider {
  name: "anthropic" | "openai";
  complete(req: CompletionRequest, config: ProviderConfig): Promise<CompletionResponse>;
}

export const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4o",
};
