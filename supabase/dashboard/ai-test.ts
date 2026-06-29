// =========================================================================
// ai-test  —  SELF-CONTAINED (for Supabase Dashboard / web deploy).
// Paste this WHOLE file as the function's index.ts. Tests the platform AI
// provider (key + base URL + model) with a tiny prompt. Super admin only.
//
// Auto-injected env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// =========================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@^0.39.0";
import OpenAI from "npm:openai@^4.77.0";

// deno-lint-ignore no-explicit-any
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
// deno-lint-ignore no-explicit-any
function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

// ---------- AI provider abstraction (inlined) ----------
const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4o",
};
type ProviderConfig = {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  baseURL?: string;
};
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

function makeAnthropic() {
  return {
    name: "anthropic" as const,
    async complete(req: { system: string; messages: { role: string; content: string }[]; maxTokens: number; temperature: number }, config: ProviderConfig) {
      const client = new Anthropic({ apiKey: config.apiKey });
      const res = await client.messages.create({
        model: config.model,
        max_tokens: req.maxTokens,
        temperature: req.temperature,
        system: req.system,
        // deno-lint-ignore no-explicit-any
        messages: req.messages as any,
      });
      const blocks: ContentBlock[] = (res.content as unknown[]).map((raw) => {
        const b = raw as Record<string, unknown>;
        return b.type === "tool_use"
          ? { type: "tool_use", id: String(b.id), name: String(b.name), input: (b.input as Record<string, unknown>) ?? {} }
          : { type: "text", text: String(b.text ?? "") };
      });
      return {
        blocks,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      };
    },
  };
}

function makeOpenAI() {
  return {
    name: "openai" as const,
    async complete(req: { system: string; messages: { role: string; content: string }[]; maxTokens: number; temperature: number }, config: ProviderConfig) {
      const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
      const messages: { role: string; content: string }[] = [];
      if (req.system) messages.push({ role: "system", content: req.system });
      messages.push(...req.messages);
      const res = await client.chat.completions.create({
        model: config.model,
        max_tokens: req.maxTokens,
        temperature: req.temperature,
        // deno-lint-ignore no-explicit-any
        messages: messages as any,
      });
      const text = res.choices[0]?.message?.content ?? "";
      return {
        blocks: [{ type: "text", text } as ContentBlock],
        inputTokens: res.usage?.prompt_tokens ?? 0,
        outputTokens: res.usage?.completion_tokens ?? 0,
      };
    },
  };
}

function getProvider(name: string) {
  return name === "openai" ? makeOpenAI() : makeAnthropic();
}

async function getPlatformConfig(
  // deno-lint-ignore no-explicit-any
  supabase: any,
) {
  const { data: cfg } = await supabase
    .from("platform_ai_config")
    .select("provider,model,temperature,max_tokens,system_prompt_extra,api_key_encrypted,base_url")
    .eq("id", 1)
    .maybeSingle();
  if (!cfg || !cfg.api_key_encrypted) return null;
  const { data: key } = await supabase.rpc("decrypt_platform_ai_key");
  if (!key) return null;
  return {
    providerName: cfg.provider as "anthropic" | "openai",
    config: {
      apiKey: String(key),
      model: cfg.model || DEFAULT_MODELS[cfg.provider] || DEFAULT_MODELS.anthropic,
      temperature: Number(cfg.temperature ?? 0.3),
      maxTokens: Number(cfg.max_tokens ?? 2048),
      baseURL: cfg.base_url ?? undefined,
    } as ProviderConfig,
  };
}

// ---------- endpoint ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const supabase = serviceClient();
  const { data: ud } = await supabase.auth.getUser(auth.slice(7));
  const user = ud.user;
  if (!user) return json({ error: "unauthorized" }, 401);
  const { data: prof } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle();
  if (!prof?.is_super_admin) return json({ error: "forbidden" }, 403);

  const active = await getPlatformConfig(supabase);
  if (!active) {
    return json({ ok: false, error: "AI belum dikonfigurasi. Isi provider, API key, (base URL), model lalu Simpan." });
  }

  const provider = getProvider(active.providerName);
  try {
    const res = await provider.complete(
      {
        system: "Kamu asisten tes. Balas sangat singkat.",
        messages: [{ role: "user", content: "Balas kata: OK" }],
        maxTokens: 32,
        temperature: 0,
      },
      active.config,
    );
    const text = res.blocks
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return json({
      ok: true,
      provider: active.providerName,
      model: active.config.model,
      baseURL: active.config.baseURL ?? null,
      reply: text || "(balasan kosong)",
      tokens: { input: res.inputTokens, output: res.outputTokens },
    });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
