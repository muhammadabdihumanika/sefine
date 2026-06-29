import type { AiProvider, ContentBlock, ProviderConfig } from "./provider.ts";
import {
  TOOL_DEFS,
  executeCreateTransaction,
  readExecutors,
  summarizeCreate,
} from "./tools.ts";

export type AgentOutcome =
  | { kind: "text"; text: string }
  | { kind: "confirm"; toolName: string; input: Record<string, unknown>; prompt: string };

export type AgentResult = {
  outcome: AgentOutcome;
  inputTokens: number;
  outputTokens: number;
};

/**
 * Runs the tool-using agent loop.
 * - read tools execute inline.
 * - create_transaction: if `autoConfirm` (web chat) it executes immediately;
 *   otherwise (WhatsApp) it returns a confirmation request.
 */
export async function runAgent(args: {
  provider: AiProvider;
  config: ProviderConfig;
  system: string;
  userMessage: string;
  // deno-lint-ignore no-explicit-any
  history: any[];
  // deno-lint-ignore no-explicit-any
  supabase: any;
  userId: string;
  orgId: string;
  autoConfirm?: boolean;
}): Promise<AgentResult> {
  // deno-lint-ignore no-explicit-any
  const messages: any[] = [
    ...(args.history ?? []),
    { role: "user", content: args.userMessage },
  ];
  let inputTokens = 0;
  let outputTokens = 0;

  for (let i = 0; i < 5; i++) {
    const res = await args.provider.complete(
      {
        system: args.system,
        messages,
        tools: TOOL_DEFS,
        maxTokens: args.config.maxTokens,
        temperature: args.config.temperature,
      },
      args.config,
    );
    inputTokens += res.inputTokens;
    outputTokens += res.outputTokens;
    messages.push({ role: "assistant", content: res.blocks });

    if (res.stopReason !== "tool_use") {
      const text = res.blocks
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return {
        outcome: { kind: "text", text: text || "Selesai." },
        inputTokens,
        outputTokens,
      };
    }

    const toolResults: ContentBlock[] = [];
    for (const b of res.blocks) {
      if (b.type !== "tool_use") continue;

      if (b.name === "create_transaction") {
        if (args.autoConfirm) {
          const r = await executeCreateTransaction(args.supabase, args.userId, args.orgId, b.input as Parameters<typeof executeCreateTransaction>[3]);
          toolResults.push({
            type: "tool_result",
            tool_use_id: b.id,
            content: r.ok ? "Berhasil dicatat." : `Gagal: ${r.error}`,
          });
          continue;
        }
        return {
          outcome: {
            kind: "confirm",
            toolName: b.name,
            input: b.input,
            prompt: summarizeCreate(b.input as Parameters<typeof summarizeCreate>[0]),
          },
          inputTokens,
          outputTokens,
        };
      }

      const exec = readExecutors[b.name];
      const out = exec
        ? await exec(args.supabase, args.orgId, b.input ?? {})
        : JSON.stringify({ error: "unknown tool" });
      toolResults.push({ type: "tool_result", tool_use_id: b.id, content: out });
    }
    messages.push({ role: "tool", content: toolResults });
  }

  return {
    outcome: { kind: "text", text: "Maaf, saya tidak bisa memproses itu sekarang." },
    inputTokens,
    outputTokens,
  };
}
