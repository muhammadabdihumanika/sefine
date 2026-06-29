import OpenAI from "npm:openai@^4.77.0";

import type {
  AiProvider,
  CompletionRequest,
  CompletionResponse,
  ContentBlock,
} from "../provider.ts";

function safeParse(s: string | undefined): Record<string, unknown> {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

export const openaiProvider: AiProvider = {
  name: "openai",
  async complete(req: CompletionRequest, config): Promise<CompletionResponse> {
    const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });

    // deno-lint-ignore no-explicit-any
    const messages: any[] = [];
    if (req.system) messages.push({ role: "system", content: req.system });

    let counter = 0;
    for (const m of req.messages) {
      if (typeof m.content === "string") {
        messages.push({ role: m.role === "tool" ? "tool" : m.role, content: m.content });
        continue;
      }
      const blocks = m.content as ContentBlock[];
      if (m.role === "assistant") {
        const text = blocks
          .filter((b) => b.type === "text")
          .map((b) => (b as { text: string }).text)
          .join("");
        const toolUses = blocks.filter((b) => b.type === "tool_use");
        // deno-lint-ignore no-explicit-any
        const entry: any = { role: "assistant", content: text || null };
        if (toolUses.length) {
          entry.tool_calls = toolUses.map((b) => {
            const tu = b as { id: string; name: string; input: Record<string, unknown> };
            return {
              id: tu.id || `call_${++counter}`,
              type: "function",
              function: { name: tu.name, arguments: JSON.stringify(tu.input ?? {}) },
            };
          });
        }
        messages.push(entry);
      } else if (m.role === "tool") {
        for (const b of blocks) {
          if (b.type === "tool_result") {
            const tr = b as { tool_use_id: string; content: string };
            messages.push({ role: "tool", tool_call_id: tr.tool_use_id, content: tr.content });
          }
        }
      } else {
        const text = blocks
          .filter((b) => b.type === "text")
          .map((b) => (b as { text: string }).text)
          .join("");
        messages.push({ role: "user", content: text });
      }
    }

    const tools = req.tools?.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));

    const res = await client.chat.completions.create({
      model: config.model,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      messages,
      // deno-lint-ignore no-explicit-any
      tools: tools as any,
    });

    const choice = res.choices[0];
    const msg = choice.message;
    const blocks: ContentBlock[] = [];
    if (msg.content) blocks.push({ type: "text", text: msg.content });
    let stop: CompletionResponse["stopReason"] = "end_turn";
    if (msg.tool_calls && msg.tool_calls.length) {
      for (const tc of msg.tool_calls) {
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: safeParse(tc.function.arguments),
        });
      }
      stop = "tool_use";
    }
    if (choice.finish_reason === "length") stop = "max_tokens";

    return {
      blocks,
      stopReason: stop,
      inputTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
    };
  },
};
