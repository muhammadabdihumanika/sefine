// =========================================================================
// ai-chat  —  SELF-CONTAINED (for Supabase Dashboard / web deploy).
// Paste this WHOLE file as the function's index.ts. Web chat AI: resolves the
// caller from their access token, runs the agent (auto-confirm mutations),
// logs usage, persists the turn, returns the reply.
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

// ---------- provider abstraction ----------
const DEFAULT_MODELS: Record<string, string> = { anthropic: "claude-sonnet-4-5", openai: "gpt-4o" };
type ProviderConfig = { apiKey: string; model: string; temperature: number; maxTokens: number; baseURL?: string };
type Role = "user" | "assistant" | "tool";
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };
type Message = { role: Role; content: string | ContentBlock[] };
type Tool = { name: string; description: string; input_schema: Record<string, unknown> };

function makeAnthropic() {
  return {
    name: "anthropic" as const,
    async complete(req: { system: string; messages: Message[]; tools?: Tool[]; maxTokens: number; temperature: number }, config: ProviderConfig) {
      const client = new Anthropic({ apiKey: config.apiKey });
      // deno-lint-ignore no-explicit-any
      const messages: any[] = req.messages.map((m) => {
        if (typeof m.content === "string") return { role: m.role, content: m.content };
        if (m.role === "tool") {
          return { role: "user", content: (m.content as ContentBlock[]).filter((b) => b.type === "tool_result").map((b) => ({ type: "tool_result", tool_use_id: (b as { tool_use_id: string }).tool_use_id, content: (b as { content: string }).content })) };
        }
        return { role: m.role, content: (m.content as ContentBlock[]).map((b) => b.type === "text" ? { type: "text", text: b.text } : { type: "tool_use", id: (b as { id: string }).id, name: (b as { name: string }).name, input: (b as { input: Record<string, unknown> }).input }) };
      });
      const res = await client.messages.create({
        model: config.model, max_tokens: req.maxTokens, temperature: req.temperature,
        system: req.system, messages,
        // deno-lint-ignore no-explicit-any
        tools: req.tools as any,
      });
      const blocks: ContentBlock[] = (res.content as unknown[]).map((raw) => {
        const b = raw as Record<string, unknown>;
        if (b.type === "tool_use") return { type: "tool_use", id: String(b.id), name: String(b.name), input: (b.input as Record<string, unknown>) ?? {} };
        return { type: "text", text: String(b.text ?? "") };
      });
      const stop = res.stop_reason === "tool_use" ? "tool_use" : res.stop_reason === "max_tokens" ? "max_tokens" : "end_turn";
      return { blocks, stopReason: stop, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
    },
  };
}
function safeParse(s: string | undefined): Record<string, unknown> {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
}
function makeOpenAI() {
  return {
    name: "openai" as const,
    async complete(req: { system: string; messages: Message[]; tools?: Tool[]; maxTokens: number; temperature: number }, config: ProviderConfig) {
      const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
      // deno-lint-ignore no-explicit-any
      const messages: any[] = [];
      if (req.system) messages.push({ role: "system", content: req.system });
      let counter = 0;
      for (const m of req.messages) {
        if (typeof m.content === "string") { messages.push({ role: m.role === "tool" ? "tool" : m.role, content: m.content }); continue; }
        const blocks = m.content as ContentBlock[];
        if (m.role === "assistant") {
          const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
          const tus = blocks.filter((b) => b.type === "tool_use");
          // deno-lint-ignore no-explicit-any
          const entry: any = { role: "assistant", content: text || null };
          if (tus.length) entry.tool_calls = tus.map((b) => { const tu = b as { id: string; name: string; input: Record<string, unknown> }; return { id: tu.id || `call_${++counter}`, type: "function", function: { name: tu.name, arguments: JSON.stringify(tu.input ?? {}) } }; });
          messages.push(entry);
        } else if (m.role === "tool") {
          for (const b of blocks) if (b.type === "tool_result") messages.push({ role: "tool", tool_call_id: (b as { tool_use_id: string }).tool_use_id, content: (b as { content: string }).content });
        } else {
          messages.push({ role: "user", content: blocks.filter((b) => b.type === "text").map((b) => b.text).join("") });
        }
      }
      const tools = req.tools?.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
      const res = await client.chat.completions.create({ model: config.model, max_tokens: req.maxTokens, temperature: req.temperature, messages, tools });
      const msg = res.choices[0].message;
      const blocks: ContentBlock[] = [];
      if (msg.content) blocks.push({ type: "text", text: msg.content });
      let stop = "end_turn";
      if (msg.tool_calls?.length) {
        for (const tc of msg.tool_calls) blocks.push({ type: "tool_use", id: tc.id, name: tc.function.name, input: safeParse(tc.function.arguments) });
        stop = "tool_use";
      }
      if (res.choices[0].finish_reason === "length") stop = "max_tokens";
      return { blocks, stopReason: stop, inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0 };
    },
  };
}
function getProvider(name: string) { return name === "openai" ? makeOpenAI() : makeAnthropic(); }

async function getPlatformConfig(
  // deno-lint-ignore no-explicit-any
  supabase: any,
) {
  const { data: cfg } = await supabase.from("platform_ai_config")
    .select("provider,model,temperature,max_tokens,system_prompt_extra,api_key_encrypted,base_url").eq("id", 1).maybeSingle();
  if (!cfg || !cfg.api_key_encrypted) return null;
  const { data: key } = await supabase.rpc("decrypt_platform_ai_key");
  if (!key) return null;
  return {
    providerName: cfg.provider as "anthropic" | "openai",
    config: { apiKey: String(key), model: cfg.model || DEFAULT_MODELS[cfg.provider] || DEFAULT_MODELS.anthropic, temperature: Number(cfg.temperature ?? 0.3), maxTokens: Number(cfg.max_tokens ?? 2048), baseURL: cfg.base_url ?? undefined } as ProviderConfig,
    systemPromptExtra: cfg.system_prompt_extra ?? null,
  };
}

// ---------- financial tools ----------
const TOOL_DEFS: Tool[] = [
  { name: "get_balances", description: "Total saldo dan saldo tiap rekening saat ini.", input_schema: { type: "object", properties: {} } },
  { name: "get_recent_transactions", description: "Transaksi terbaru.", input_schema: { type: "object", properties: { limit: { type: "number" } } } },
  { name: "get_upcoming_bills", description: "Tagihan belum dibayar jatuh tempo dekat.", input_schema: { type: "object", properties: { days: { type: "number" } } } },
  { name: "get_spending_summary", description: "Ringkasan pemasukan & pengeluaran bulan ini.", input_schema: { type: "object", properties: {} } },
  { name: "create_transaction", description: "Mencatat transaksi baru (income/expense).", input_schema: { type: "object", properties: { type: { type: "string", enum: ["income", "expense"] }, amount: { type: "number" }, account_name: { type: "string" }, category_name: { type: "string" }, description: { type: "string" } }, required: ["type", "amount"] } },
];
async function getBalances(
  // deno-lint-ignore no-explicit-any
  supabase: any, orgId: string, _input?: unknown,
) {
  const { data } = await supabase.from("account_balances").select("name,current_balance,currency").eq("organization_id", orgId).eq("is_archived", false);
  const accounts = (data ?? []).map((a: { name: string; current_balance: number; currency: string }) => ({ name: a.name, balance: Number(a.current_balance), currency: a.currency }));
  const total = accounts.reduce((s: number, a: { balance: number }) => s + a.balance, 0);
  return JSON.stringify({ total, currency: accounts[0]?.currency ?? "IDR", accounts });
}
async function getRecentTransactions(
  // deno-lint-ignore no-explicit-any
  supabase: any, orgId: string, input: { limit?: number },
) {
  const { data } = await supabase.from("transactions").select("type,amount,description,transaction_date, account:accounts(name), category:categories(name)").eq("organization_id", orgId).is("deleted_at", null).in("type", ["income", "expense", "transfer_debit"]).order("transaction_date", { ascending: false }).order("created_at", { ascending: false }).limit(input?.limit ?? 10);
  return JSON.stringify({ transactions: (data ?? []).map(
    // deno-lint-ignore no-explicit-any
    (t: any) => ({ type: t.type, amount: Number(t.amount), date: t.transaction_date, description: t.description, account: t.account?.name, category: t.category?.name }) ) });
}
async function getUpcomingBills(
  // deno-lint-ignore no-explicit-any
  supabase: any, orgId: string, input: { days?: number },
) {
  const horizon = new Date(Date.now() + (input?.days ?? 7) * 86400000).toISOString().slice(0, 10);
  const { data } = await supabase.from("bills").select("name,amount,next_due_date").eq("organization_id", orgId).eq("is_paid", false).lte("next_due_date", horizon).order("next_due_date", { ascending: true }).limit(10);
  return JSON.stringify({ bills: data ?? [] });
}
async function getSpendingSummary(
  // deno-lint-ignore no-explicit-any
  supabase: any, orgId: string, _input?: unknown,
) {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const { data } = await supabase.from("transactions").select("type,amount").eq("organization_id", orgId).is("deleted_at", null).gte("transaction_date", monthStart);
  let income = 0, expense = 0;
  // deno-lint-ignore no-explicit-any
  for (const t of data ?? []) { if (t.type === "income") income += Number(t.amount); else if (t.type === "expense") expense += Number(t.amount); }
  return JSON.stringify({ month: monthStart, income, expense, net: income - expense });
}
const readExecutors: Record<string,
  // deno-lint-ignore no-explicit-any
  (supabase: any, orgId: string, input: any) => Promise<string>> = {
  get_balances: getBalances, get_recent_transactions: getRecentTransactions, get_upcoming_bills: getUpcomingBills, get_spending_summary: getSpendingSummary,
};
async function executeCreateTransaction(
  // deno-lint-ignore no-explicit-any
  supabase: any, userId: string, orgId: string, input: { type: "income" | "expense"; amount: number; account_name?: string; category_name?: string; description?: string },
) {
  const { data: member } = await supabase.from("organization_members").select("role").eq("organization_id", orgId).eq("user_id", userId).maybeSingle();
  if (!member) return { error: "Bukan anggota" };
  if (!["owner", "admin", "member"].includes(member.role)) return { error: "Peran tidak diizinkan" };
  const { data: accounts } = await supabase.from("accounts").select("id,name").eq("organization_id", orgId).eq("is_archived", false);
  const want = String(input.account_name ?? "").toLowerCase();
  // deno-lint-ignore no-explicit-any
  const list: any[] = accounts ?? [];
  const account = list.find((a) => a.name.toLowerCase() === want) || (want && list.find((a) => a.name.toLowerCase().includes(want))) || list[0];
  if (!account) return { error: "Tidak ada rekening" };
  let categoryId: string | null = null;
  if (input.category_name) {
    const { data: cats } = await supabase.from("categories").select("id,name,type").eq("organization_id", orgId);
    const cat = (cats ?? []).find(
      // deno-lint-ignore no-explicit-any
      (c: any) => c.name.toLowerCase() === String(input.category_name).toLowerCase() && c.type === input.type);
    categoryId = cat?.id ?? null;
  }
  const amount = Number(input.amount);
  if (!amount || amount <= 0) return { error: "Nominal tidak valid" };
  const { error } = await supabase.from("transactions").insert({ organization_id: orgId, account_id: account.id, type: input.type, amount, category_id: categoryId, description: input.description ?? null, transaction_date: new Date().toISOString().slice(0, 10), created_by: userId, source: "wa_assistant" });
  if (error) return { error: error.message };
  return { ok: true };
}

// ---------- agent loop (autoConfirm = true for chat) ----------
async function runAgent(args: {
  provider: ReturnType<typeof getProvider>; config: ProviderConfig; system: string; userMessage: string;
  // deno-lint-ignore no-explicit-any
  history: any[]; supabase: ReturnType<typeof serviceClient>; userId: string; orgId: string;
}) {
  // deno-lint-ignore no-explicit-any
  const messages: any[] = [...(args.history ?? []), { role: "user", content: args.userMessage }];
  let inputTokens = 0, outputTokens = 0;
  for (let i = 0; i < 5; i++) {
    const res = await args.provider.complete({ system: args.system, messages, tools: TOOL_DEFS, maxTokens: args.config.maxTokens, temperature: args.config.temperature }, args.config);
    inputTokens += res.inputTokens; outputTokens += res.outputTokens;
    messages.push({ role: "assistant", content: res.blocks });
    if (res.stopReason !== "tool_use") {
      const text = res.blocks.filter((b): b is { type: "text"; text: string } => b.type === "text").map((b) => b.text).join("\n").trim();
      return { text: text || "Selesai.", inputTokens, outputTokens };
    }
    const toolResults: ContentBlock[] = [];
    for (const b of res.blocks) {
      if (b.type !== "tool_use") continue;
      if (b.name === "create_transaction") {
        const r = await executeCreateTransaction(args.supabase, args.userId, args.orgId, b.input as Parameters<typeof executeCreateTransaction>[3]);
        toolResults.push({ type: "tool_result", tool_use_id: b.id, content: r.ok ? "Berhasil dicatat." : `Gagal: ${r.error}` });
        continue;
      }
      const exec = readExecutors[b.name];
      const out = exec ? await exec(args.supabase, args.orgId, b.input ?? {}) : JSON.stringify({ error: "unknown tool" });
      toolResults.push({ type: "tool_result", tool_use_id: b.id, content: out });
    }
    messages.push({ role: "tool", content: toolResults });
  }
  return { text: "Maaf, saya tidak bisa memproses itu sekarang.", inputTokens, outputTokens };
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

  let body: { message?: string; conversation_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid body" }, 400); }
  const message = String(body?.message ?? "").trim();
  if (!message) return json({ error: "empty message" }, 400);

  const { data: profile } = await supabase.from("profiles").select("active_organization_id, default_currency").eq("id", user.id).maybeSingle();
  const orgId = profile?.active_organization_id as string | undefined;
  if (!orgId) return json({ error: "no_active_org" }, 400);

  const active = await getPlatformConfig(supabase);
  if (!active) return json({ error: "ai_not_configured" }, 503);

  // resolve or create the chat conversation
  let conversationId = body.conversation_id || null;
  if (!conversationId) {
    const { data: conv } = await supabase.from("ai_conversations").insert({ organization_id: orgId, user_id: user.id, channel: "web", title: message.slice(0, 48) }).select("id").single();
    conversationId = conv?.id ?? null;
  }

  const currency = profile?.default_currency ?? "IDR";
  const [b, s, bills] = await Promise.all([getBalances(supabase, orgId, {}), getSpendingSummary(supabase, orgId, {}), getUpcomingBills(supabase, orgId, { days: 7 })]);
  const ctxBal = JSON.parse(b), ctxSpend = JSON.parse(s), ctxBills = JSON.parse(bills);
  const system = [
    "Anda adalah asisten keuangan pribadi Sefine. Jawab dalam Bahasa Indonesia, singkat, ramah, akurat. Anda bisa membaca data keuangan dan mencatat transaksi.",
    `Mata uang organisasi: ${currency}.`,
    `Saldo total: Rp ${Number(ctxBal.total ?? 0).toLocaleString("id-ID")}; bulan ini masuk Rp ${Number(ctxSpend.income ?? 0).toLocaleString("id-ID")}, keluar Rp ${Number(ctxSpend.expense ?? 0).toLocaleString("id-ID")}.`,
    ctxBills.bills?.length ? `Tagihan dekat jatuh tempo: ${ctxBills.bills.map((x: { name: string; amount: number }) => `${x.name} (Rp ${Number(x.amount).toLocaleString("id-ID")})`).join("; ")}.` : "Tidak ada tagihan jatuh tempo 7 hari.",
    active.systemPromptExtra ?? "",
    "Untuk mencatat transaksi, panggil tool create_transaction. Jangan mengarang angka.",
  ].join("\n");

  let rowsQuery = supabase.from("ai_messages").select("role,content").order("created_at", { ascending: false }).limit(8);
  if (conversationId) rowsQuery = rowsQuery.eq("conversation_id", conversationId);
  const { data: rows } = await rowsQuery;
  // deno-lint-ignore no-explicit-any
  const history = (rows ?? []).reverse().map((r: any) => ({ role: r.role, content: r.content?.text ?? (typeof r.content === "string" ? r.content : "") }));

  const provider = getProvider(active.providerName);
  const { text: reply, inputTokens, outputTokens } = await runAgent({ provider, config: active.config, system, userMessage: message, history, supabase, userId: user.id, orgId });

  // record usage (credits) — capture result for diagnostics
  let recorded = false;
  let recordError: string | undefined;
  try {
    const r = await supabase.rpc("record_ai_usage", { p_user: user.id, p_org: orgId, p_provider: active.providerName, p_model: active.config.model, p_input: inputTokens, p_output: outputTokens, p_source: "chat" });
    recorded = !r.error;
    recordError = r.error?.message;
  } catch (e) {
    recordError = e instanceof Error ? e.message : String(e);
  }

  await supabase.from("ai_messages").insert([
    { organization_id: orgId, user_id: user.id, conversation_id: conversationId, channel: "web", role: "user", content: { text: message } },
    { organization_id: orgId, user_id: user.id, conversation_id: conversationId, channel: "web", role: "assistant", content: { text: reply } },
  ]);
  if (conversationId) {
    await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  }
  return json({ reply, conversation_id: conversationId, usage: { input: inputTokens, output: outputTokens, recorded, error: recordError } });
});
