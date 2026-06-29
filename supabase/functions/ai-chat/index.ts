// Web chat AI endpoint. Authenticates via the caller's access token, runs the
// agent (auto-confirm mutations), logs usage, persists the turn, returns reply.

import { serviceClient } from "../_shared/supabase.ts";
import { runAgent } from "../_shared/ai/agent.ts";
import { getPlatformConfig, getProvider } from "../_shared/ai/factory.ts";
import {
  getBalances,
  getSpendingSummary,
  getUpcomingBills,
} from "../_shared/ai/tools.ts";

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
  const token = auth.slice(7);

  const supabase = serviceClient();
  const { data: userData } = await supabase.auth.getUser(token);
  const user = userData.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: { message?: string; conversation_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid body" }, 400);
  }
  const message = String(body?.message ?? "").trim();
  if (!message) return json({ error: "empty message" }, 400);

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_organization_id, default_currency")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = profile?.active_organization_id as string | undefined;
  if (!orgId) return json({ error: "no_active_org" }, 400);

  const active = await getPlatformConfig(supabase);
  if (!active) return json({ error: "ai_not_configured" }, 503);

  // resolve or create the chat conversation
  let conversationId = body.conversation_id || null;
  if (!conversationId) {
    const { data: conv } = await supabase
      .from("ai_conversations")
      .insert({ organization_id: orgId, user_id: user.id, channel: "web", title: message.slice(0, 48) })
      .select("id")
      .single();
    conversationId = conv?.id ?? null;
  }

  const currency = profile?.default_currency ?? "IDR";
  const [b, s, bills] = await Promise.all([
    getBalances(supabase, orgId, {}),
    getSpendingSummary(supabase, orgId, {}),
    getUpcomingBills(supabase, orgId, { days: 7 }),
  ]);
  const ctxBal = JSON.parse(b);
  const ctxSpend = JSON.parse(s);
  const ctxBills = JSON.parse(bills);

  const system = [
    "Anda adalah asisten keuangan pribadi Sefine. Jawab dalam Bahasa Indonesia, singkat, ramah, dan akurat. Anda bisa membaca data keuangan dan mencatat transaksi.",
    `Mata uang organisasi: ${currency}.`,
    `Saldo total: Rp ${Number(ctxBal.total ?? 0).toLocaleString("id-ID")}; bulan ini masuk Rp ${Number(ctxSpend.income ?? 0).toLocaleString("id-ID")}, keluar Rp ${Number(ctxSpend.expense ?? 0).toLocaleString("id-ID")}.`,
    ctxBills.bills?.length
      ? `Tagihan dekat jatuh tempo: ${ctxBills.bills.map((x: { name: string; amount: number; next_due_date: string }) => `${x.name} (Rp ${Number(x.amount).toLocaleString("id-ID")})`).join("; ")}.`
      : "Tidak ada tagihan jatuh tempo dalam 7 hari.",
    active.systemPromptExtra ?? "",
    "Untuk mencatat transaksi, panggil tool create_transaction. Jangan mengarang angka.",
  ].join("\n");

  let rowsQuery = supabase
    .from("ai_messages")
    .select("role,content")
    .order("created_at", { ascending: false })
    .limit(8);
  if (conversationId) rowsQuery = rowsQuery.eq("conversation_id", conversationId);
  const { data: rows } = await rowsQuery;
  // deno-lint-ignore no-explicit-any
  const history = (rows ?? []).reverse().map((r: any) => ({
    role: r.role,
    content: r.content?.text ?? (typeof r.content === "string" ? r.content : ""),
  }));

  const provider = getProvider(active.providerName);
  const { outcome, inputTokens, outputTokens } = await runAgent({
    provider,
    config: active.config,
    system,
    userMessage: message,
    history,
    supabase,
    userId: user.id,
    orgId,
    autoConfirm: true,
  });

  // record usage (credits) — capture result for diagnostics
  let recorded = false;
  let recordError: string | undefined;
  try {
    const r = await supabase.rpc("record_ai_usage", {
      p_user: user.id,
      p_org: orgId,
      p_provider: active.providerName,
      p_model: active.config.model,
      p_input: inputTokens,
      p_output: outputTokens,
      p_source: "chat",
    });
    recorded = !r.error;
    recordError = r.error?.message;
  } catch (e) {
    recordError = e instanceof Error ? e.message : String(e);
  }

  const reply = outcome.kind === "text" ? outcome.text : outcome.prompt;
  await supabase.from("ai_messages").insert([
    { organization_id: orgId, user_id: user.id, conversation_id: conversationId, channel: "web", role: "user", content: { text: message } },
    { organization_id: orgId, user_id: user.id, conversation_id: conversationId, channel: "web", role: "assistant", content: { text: reply } },
  ]);
  if (conversationId) {
    await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  }

  return json({ reply, conversation_id: conversationId, usage: { input: inputTokens, output: outputTokens, recorded, error: recordError } });
});
