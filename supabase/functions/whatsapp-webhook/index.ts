// WhatsApp Cloud API webhook for the Sefine AI assistant.
// GET  -> Meta verification (hub.challenge).
// POST -> signature check, respond 200 fast, process inbound in background.

import { serviceClient } from "../_shared/supabase.ts";
import {
  parseInbound,
  sendWhatsAppMessage,
  verifySignature,
} from "../_shared/whatsapp.ts";
import { runAgent } from "../_shared/ai/agent.ts";
import { getPlatformConfig, getProvider } from "../_shared/ai/factory.ts";
import { getBalances, getSpendingSummary, getUpcomingBills, executeCreateTransaction } from "../_shared/ai/tools.ts";

// deno-lint-ignore no-explicit-any
function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // --- Verification ---
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = Deno.env.get("WA_VERIFY_TOKEN");
    if (mode === "subscribe" && token === verifyToken && challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  // --- Signature verification ---
  const raw = await req.text();
  const sigOk = await verifySignature(raw, req.headers.get("X-Hub-Signature-256"));
  if (!sigOk) return json({ error: "invalid signature" }, 401);

  // deno-lint-ignore no-explicit-any
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  // Respond 200 immediately; Meta retries if slow. Process in background.
  EdgeRuntime.waitUntil(handleInbound(payload));
  return json({ ok: true }, 200);
});

// deno-lint-ignore no-explicit-any
async function handleInbound(payload: any) {
  const inbound = parseInbound(payload);
  if (!inbound || !inbound.text) return;

  const supabase = serviceClient();

  // Idempotency: dedupe by Meta message id.
  const { error: dupErr } = await supabase
    .from("wa_inbound")
    .insert({ message_id: inbound.messageId });
  if (dupErr) {
    // unique violation → already processed
    return;
  }

  const text = inbound.text.trim();
  const from = inbound.from;

  // Resolve user from a verified WhatsApp link.
  const { data: link } = await supabase
    .from("whatsapp_links")
    .select("user_id")
    .eq("phone_number", from)
    .eq("status", "verified")
    .maybeSingle();
  if (!link) {
    await sendWhatsAppMessage(
      from,
      "Halo! Akun WhatsApp Anda belum terhubung ke Sefine. Hubungkan di menu Pengaturan → Integrasi.",
    );
    return;
  }
  const userId = link.user_id as string;

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_organization_id, default_currency")
    .eq("id", userId)
    .maybeSingle();
  const orgId = profile?.active_organization_id as string | undefined;
  if (!orgId) {
    await sendWhatsAppMessage(from, "Anda belum memiliki organisasi aktif di Sefine.");
    return;
  }

  // Confirmation: affirmative → run pending create; negative → cancel.
  const AFFIRM = /^(ya|iya|yoi|yup|yes|ok|oke|okay|gas|benar|confirm|konfirmasi|setuju)[\s!.]?$/i;
  const NEG = /^(tidak|nggak|ngga|gak|ga|batal|cancel|no|engga)[\s!.]?$/i;

  if (AFFIRM.test(text)) {
    const { data: pending } = await supabase
      .from("ai_pending_actions")
      .select("id,action_type,payload")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pending && pending.action_type === "create_transaction") {
      const res = await executeCreateTransaction(supabase, userId, orgId, pending.payload);
      await supabase.from("ai_pending_actions").delete().eq("id", pending.id);
      const reply = res.ok ? "✅ Tercatat! Transaksi berhasil disimpan." : `⚠️ Gagal mencatat: ${res.error}`;
      await sendWhatsAppMessage(from, reply);
      await persistTurn(supabase, orgId, userId, inbound.messageId, text, reply);
      return;
    }
  }
  if (NEG.test(text)) {
    await supabase.from("ai_pending_actions").delete().eq("user_id", userId);
    await sendWhatsAppMessage(from, "Oke, dibatalkan. 👍");
    await persistTurn(supabase, orgId, userId, inbound.messageId, text, "Dibatalkan.");
    return;
  }

  // Platform AI config (managed by super admin).
  const active = await getPlatformConfig(supabase);
  if (!active) {
    await sendWhatsAppMessage(
      from,
      "Asisten AI belum dikonfigurasi oleh admin platform.",
    );
    return;
  }

  // Build context snapshot for the system prompt.
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
    `Anda adalah asisten keuangan pribadi Sefine. Bantu pengguna memantau dan mencatat keuangan dalam Bahasa Indonesia, singkat, ramah, dan akurat.`,
    `Mata uang organisasi: ${currency}.`,
    `Ringkasan saat ini — Saldo total: Rp ${Number(ctxBal.total ?? 0).toLocaleString("id-ID")}; bulan ini masuk Rp ${Number(ctxSpend.income ?? 0).toLocaleString("id-ID")}, keluar Rp ${Number(ctxSpend.expense ?? 0).toLocaleString("id-ID")}.`,
    ctxBills.bills?.length
      ? `Tagihan jatuh tempo dekat: ${ctxBills.bills.map((x: { name: string; amount: number; next_due_date: string }) => `${x.name} (Rp ${Number(x.amount).toLocaleString("id-ID")}, ${x.next_due_date})`).join("; ")}.`
      : "Tidak ada tagihan jatuh tempo dalam 7 hari.",
    active.systemPromptExtra ?? "",
    `Untuk mencatat transaksi, panggil tool create_transaction (akan meminta konfirmasi pengguna). Jangan mengarang angka.`,
  ].join("\n");

  // Recent history.
  const { data: rows } = await supabase
    .from("ai_messages")
    .select("role,content")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(8);
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
    userMessage: text,
    history,
    supabase,
    userId,
    orgId,
  });

  // log usage (credits) — foundation for future subscription billing
  await supabase.rpc("record_ai_usage", {
    p_user: userId,
    p_org: orgId,
    p_provider: active.providerName,
    p_model: active.config.model,
    p_input: inputTokens,
    p_output: outputTokens,
    p_source: "whatsapp",
  });

  if (outcome.kind === "text") {
    await sendWhatsAppMessage(from, outcome.text);
    await persistTurn(supabase, orgId, userId, inbound.messageId, text, outcome.text);
    return;
  }

  // Confirm: store pending action and ask the user.
  await supabase.from("ai_pending_actions").insert({
    organization_id: orgId,
    user_id: userId,
    action_type: outcome.toolName,
    payload: outcome.input,
    wa_message_id: inbound.messageId,
  });
  await sendWhatsAppMessage(from, outcome.prompt);
  await persistTurn(supabase, orgId, userId, inbound.messageId, text, outcome.prompt);
}

async function persistTurn(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  orgId: string,
  userId: string,
  waMessageId: string,
  userText: string,
  assistantText: string,
) {
  await supabase.from("ai_messages").insert([
    {
      organization_id: orgId,
      user_id: userId,
      channel: "whatsapp",
      role: "user",
      content: { text: userText },
      wa_message_id: waMessageId,
    },
    {
      organization_id: orgId,
      user_id: userId,
      channel: "whatsapp",
      role: "assistant",
      content: { text: assistantText },
    },
  ]);
}
