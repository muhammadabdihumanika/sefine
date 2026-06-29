import Anthropic from "npm:@anthropic-ai/sdk@^0.39.0";

import type {
  AiProvider,
  CompletionRequest,
  CompletionResponse,
  ContentBlock,
  Message,
} from "../provider.ts";

function toAnthropicMessages(messages: Message[]): unknown[] {
  return messages.map((m) => {
    if (typeof m.content === "string") {
      return { role: m.role, content: m.content };
    }
    if (m.role === "tool") {
      return {
        role: "user",
        content: (m.content as ContentBlock[])
          .filter((b) => b.type === "tool_result")
          .map((b) => ({
            type: "tool_result",
            tool_use_id: (b as { tool_use_id: string }).tool_use_id,
            content: (b as { content: string }).content,
          })),
      };
    }
    return {
      role: m.role,
      content: (m.content as ContentBlock[]).map((b) =>
        b.type === "text"
          ? { type: "text", text: b.text }
          : {
              type: "tool_use",
              id: (b as { id: string }).id,
              name: (b as { name: string }).name,
              input: (b as { input: Record<string, unknown> }).input,
            },
      ),
    };
  });
}

export const anthropicProvider: AiProvider = {
  name: "anthropic",
  async complete(req: CompletionRequest, config): Promise<CompletionResponse> {
    const client = new Anthropic({ apiKey: config.apiKey });
    const res = await client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      system: req.system,
      // deno-lint-ignore no-explicit-any
      messages: toAnthropicMessages(req.messages) as any,
      // deno-lint-ignore no-explicit-any
      tools: req.tools as any,
    });

    const blocks: ContentBlock[] = (res.content as unknown[]).map((raw) => {
      const b = raw as Record<string, unknown>;
      if (b.type === "text") {
        return { type: "text", text: String(b.text) };
      }
      if (b.type === "tool_use") {
        return {
          type: "tool_use",
          id: String(b.id),
          name: String(b.name),
          input: (b.input as Record<string, unknown>) ?? {},
        };
      }
      return { type: "text", text: JSON.stringify(b) };
    });

    const stop =
      res.stop_reason === "tool_use"
        ? "tool_use"
        : res.stop_reason === "max_tokens"
          ? "max_tokens"
          : "end_turn";

    return {
      blocks,
      stopReason: stop,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    };
  },
};
