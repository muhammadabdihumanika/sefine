// Tests the configured platform AI provider with a tiny prompt.
// Super admin only. Returns ok + a short reply, or the error message.

import { serviceClient } from "../_shared/supabase.ts";
import { getPlatformConfig, getProvider } from "../_shared/ai/factory.ts";

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

  const { data: prof } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!prof?.is_super_admin) return json({ error: "forbidden" }, 403);

  const active = await getPlatformConfig(supabase);
  if (!active) {
    return json({
      ok: false,
      error: "AI belum dikonfigurasi. Isi provider, API key, (base URL), dan model, lalu Simpan dulu.",
    });
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
    return json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});
