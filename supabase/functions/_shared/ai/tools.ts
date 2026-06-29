// Financial tools the AI assistant can call. Read tools execute inline;
// create_transaction is gated behind user confirmation (handled in agent.ts).

export type ToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "get_balances",
    description: "Dapatkan total saldo dan saldo tiap rekening organisasi saat ini.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_recent_transactions",
    description: "Daftar transaksi terbaru (default 10).",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number", description: "jumlah baris, default 10" } },
    },
  },
  {
    name: "get_upcoming_bills",
    description: "Tagihan belum dibayar yang akan jatuh tempo (default 7 hari ke depan).",
    input_schema: {
      type: "object",
      properties: { days: { type: "number", description: "horizon hari, default 7" } },
    },
  },
  {
    name: "get_spending_summary",
    description: "Ringkasan total pemasukan & pengeluaran bulan ini.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_transaction",
    description:
      "Mencatat transaksi baru (pemasukan/pengeluaran). AKAN meminta konfirmasi pengguna sebelum benar-benar menyimpan.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["income", "expense"],
          description: "income = uang masuk, expense = uang keluar",
        },
        amount: { type: "number", description: "Nominal positif dalam mata uang organisasi." },
        account_name: { type: "string", description: "Nama rekening. Jika ragu, pakai rekening utama." },
        category_name: { type: "string", description: "Nama kategori (opsional)." },
        description: { type: "string", description: "Keterangan (opsional)." },
      },
      required: ["type", "amount"],
    },
  },
];

// ---------------------------------------------------------------------------
// Read executors
// ---------------------------------------------------------------------------
export async function getBalances(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  orgId: string,
): Promise<string> {
  const { data } = await supabase
    .from("account_balances")
    .select("name,current_balance,currency")
    .eq("organization_id", orgId)
    .eq("is_archived", false);
  const accounts = (data ?? []).map(
    (a: { name: string; current_balance: number; currency: string }) => ({
      name: a.name,
      balance: Number(a.current_balance),
      currency: a.currency,
    }),
  );
  const total = accounts.reduce((s: number, a: { balance: number }) => s + a.balance, 0);
  return JSON.stringify({ total, currency: accounts[0]?.currency ?? "IDR", accounts });
}

export async function getRecentTransactions(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  orgId: string,
  input: { limit?: number },
): Promise<string> {
  const limit = input?.limit ?? 10;
  const { data } = await supabase
    .from("transactions")
    .select("type,amount,description,transaction_date, account:accounts(name), category:categories(name)")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .in("type", ["income", "expense", "transfer_debit"])
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  const transactions = (data ?? []).map(
    // deno-lint-ignore no-explicit-any
    (t: any) => ({
      type: t.type,
      amount: Number(t.amount),
      date: t.transaction_date,
      description: t.description,
      account: t.account?.name,
      category: t.category?.name,
    }),
  );
  return JSON.stringify({ transactions });
}

export async function getUpcomingBills(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  orgId: string,
  input: { days?: number },
): Promise<string> {
  const days = input?.days ?? 7;
  const horizon = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("bills")
    .select("name,amount,next_due_date,currency")
    .eq("organization_id", orgId)
    .eq("is_paid", false)
    .lte("next_due_date", horizon)
    .order("next_due_date", { ascending: true })
    .limit(10);
  return JSON.stringify({ bills: data ?? [] });
}

export async function getSpendingSummary(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  orgId: string,
): Promise<string> {
  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  ).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("transactions")
    .select("type,amount")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .gte("transaction_date", monthStart);
  let income = 0;
  let expense = 0;
  // deno-lint-ignore no-explicit-any
  for (const t of data ?? []) {
    if (t.type === "income") income += Number(t.amount);
    else if (t.type === "expense") expense += Number(t.amount);
  }
  return JSON.stringify({ month: monthStart, income, expense, net: income - expense });
}

export const readExecutors: Record<
  string,
  // deno-lint-ignore no-explicit-any
  (supabase: any, orgId: string, input: any) => Promise<string>
> = {
  get_balances: getBalances,
  get_recent_transactions: getRecentTransactions,
  get_upcoming_bills: getUpcomingBills,
  get_spending_summary: getSpendingSummary,
};

// ---------------------------------------------------------------------------
// Mutation (executed only after user confirms)
// ---------------------------------------------------------------------------
export async function executeCreateTransaction(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  orgId: string,
  input: {
    type: "income" | "expense";
    amount: number;
    account_name?: string;
    category_name?: string;
    description?: string;
  },
): Promise<{ ok?: true; id?: string; error?: string }> {
  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return { error: "Bukan anggota organisasi" };
  if (!["owner", "admin", "member"].includes(member.role)) {
    return { error: "Peran tidak diizinkan mencatat transaksi" };
  }

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id,name")
    .eq("organization_id", orgId)
    .eq("is_archived", false);
  // Resolve category (if named) and read its configured default account.
  let categoryId: string | null = null;
  let categoryDefaultAccount: string | null = null;
  if (input.category_name) {
    const { data: cats } = await supabase
      .from("categories")
      .select("id,name,type,default_account_id")
      .eq("organization_id", orgId);
    const cat = (cats ?? []).find(
      // deno-lint-ignore no-explicit-any
      (c: any) =>
        c.name.toLowerCase() === String(input.category_name).toLowerCase() &&
        c.type === input.type,
    );
    categoryId = cat?.id ?? null;
    categoryDefaultAccount = cat?.default_account_id ?? null;
  }

  // Resolve account: explicit name > category default > first account.
  const want = String(input.account_name ?? "").toLowerCase();
  // deno-lint-ignore no-explicit-any
  const list: any[] = accounts ?? [];
  const account =
    (want && list.find((a) => a.name.toLowerCase() === want)) ||
    (want && list.find((a) => a.name.toLowerCase().includes(want))) ||
    (categoryDefaultAccount &&
      list.find((a) => a.id === categoryDefaultAccount)) ||
    list[0];
  if (!account) return { error: "Tidak ada rekening untuk mencatat" };

  const amount = Number(input.amount);
  if (!amount || amount <= 0) return { error: "Nominal tidak valid" };

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      organization_id: orgId,
      account_id: account.id,
      type: input.type,
      amount,
      category_id: categoryId,
      description: input.description ?? null,
      transaction_date: new Date().toISOString().slice(0, 10),
      created_by: userId,
      source: "wa_assistant",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { ok: true, id: data.id };
}

export function summarizeCreate(input: {
  type: "income" | "expense";
  amount: number;
  account_name?: string;
  description?: string;
}): string {
  const type = input.type === "income" ? "pemasukan" : "pengeluaran";
  const amt = Number(input.amount ?? 0).toLocaleString("id-ID");
  const parts = [`Catat ${type} sebesar Rp ${amt}`];
  if (input.description) parts.push(`untuk "${input.description}"`);
  if (input.account_name) parts.push(`dari ${input.account_name}`);
  return parts.join(" ") + "? Balas *YA* untuk konfirmasi.";
}
