import Link from "next/link";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  CalendarClockIcon,
  ChevronRightIcon,
  WalletIcon,
} from "lucide-react";

import { GlassCard } from "@/components/glass/glass-card";
import {
  TransactionList,
  type TxRow,
} from "@/components/transactions/transaction-list";
import { formatCompactCurrency, formatCurrency, formatRelativeDay } from "@/lib/format";
import { requireActiveOrg } from "@/lib/session";
import { createClient } from "@/utils/supabase/server";

type AccountBalance = { id: string; name: string; current_balance: number };
type UpcomingBill = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  next_due_date: string;
};

export default async function HomePage() {
  const ctx = await requireActiveOrg();
  const currency = ctx.memberships.find(
    (m) => m.organization_id === ctx.activeOrgId,
  )?.organization.base_currency ?? "IDR";

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const supabase = await createClient();
  const [accountsRes, monthRes, recentRes, billsRes] = await Promise.all([
    supabase
      .from("account_balances")
      .select("id,name,current_balance")
      .eq("organization_id", ctx.activeOrgId)
      .eq("is_archived", false),
    supabase
      .from("transactions")
      .select("type,amount, category:categories(id,name)")
      .eq("organization_id", ctx.activeOrgId)
      .is("deleted_at", null)
      .gte("transaction_date", monthStart),
    supabase
      .from("transactions")
      .select(
        "id,type,amount,description,transaction_date,created_at,organization_id, account:accounts(id,name), category:categories(id,name,type)",
      )
      .eq("organization_id", ctx.activeOrgId)
      .is("deleted_at", null)
      .in("type", ["income", "expense", "transfer_debit"])
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(0, 4),
    supabase
      .from("bills")
      .select("id,name,amount,currency,next_due_date")
      .eq("organization_id", ctx.activeOrgId)
      .eq("is_paid", false)
      .order("next_due_date", { ascending: true })
      .range(0, 2),
  ]);

  const accounts = (accountsRes.data ?? []) as AccountBalance[];
  const totalBalance = accounts.reduce(
    (s, a) => s + Number(a.current_balance || 0),
    0,
  );

  const monthTx = (monthRes.data ?? []) as unknown as Array<{
    type: "income" | "expense" | "transfer_debit" | "transfer_credit";
    amount: number;
    category: { name: string } | null;
  }>;
  const income = monthTx
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  const expense = monthTx
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + Number(t.amount), 0);

  const spending = new Map<string, number>();
  for (const t of monthTx) {
    if (t.type !== "expense") continue;
    const key = t.category?.name ?? "Lainnya";
    spending.set(key, (spending.get(key) ?? 0) + Number(t.amount));
  }
  const topSpending = Array.from(spending.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxSpending = topSpending[0]?.[1] ?? 0;

  const recent = (recentRes.data ?? []) as unknown as TxRow[];
  const upcoming = (billsRes.data ?? []) as UpcomingBill[];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground">Total saldo</p>
        <p className="font-heading text-3xl font-semibold tracking-tight tabular-nums">
          {formatCurrency(totalBalance, currency)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {accounts.length} rekening · {currency}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Masuk (bulan ini)"
          value={formatCompactCurrency(income, currency)}
          tone="income"
          icon={ArrowDownLeftIcon}
        />
        <StatCard
          label="Keluar (bulan ini)"
          value={formatCompactCurrency(expense, currency)}
          tone="expense"
          icon={ArrowUpRightIcon}
        />
      </div>

      {upcoming.length > 0 && (
        <GlassCard className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">Tagihan berikutnya</p>
            <Link href="/bills" className="flex items-center text-xs text-primary">
              Lihat semua <ChevronRightIcon className="size-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {upcoming.map((b) => (
              <div key={b.id} className="flex items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-500">
                  <CalendarClockIcon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{b.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatRelativeDay(b.next_due_date)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatCurrency(Number(b.amount), b.currency || currency)}
                </span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <GlassCard className="p-4">
        <p className="mb-3 text-sm font-medium">Belanja per kategori</p>
        {topSpending.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Belum ada pengeluaran bulan ini.
          </p>
        ) : (
          <div className="space-y-2.5">
            {topSpending.map(([name, value]) => (
              <div key={name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{name}</span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(value, currency)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.max(6, (value / maxSpending) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-sm font-medium">Aktivitas terbaru</span>
          <Link
            href="/transactions"
            className="flex items-center text-xs text-primary"
          >
            Lihat semua <ChevronRightIcon className="size-3" />
          </Link>
        </div>
        {recent.length === 0 ? (
          <GlassCard className="p-6 text-center text-xs text-muted-foreground">
            Belum ada transaksi. Ketuk + untuk mencatat.
          </GlassCard>
        ) : (
          <TransactionList transactions={recent} canDelete={false} />
        )}
      </div>

      <Link
        href="/settings/accounts"
        className="glass flex items-center gap-3 rounded-2xl p-3 transition active:scale-[0.99]"
      >
        <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
          <WalletIcon className="size-5" />
        </span>
        <span className="flex-1 text-sm font-medium">Kelola rekening</span>
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      </Link>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone: "income" | "expense";
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <GlassCard variant="subtle" className="p-4">
      <div className="flex items-center gap-1.5">
        <span
          className={
            "grid size-6 place-items-center rounded-full " +
            (tone === "income"
              ? "bg-emerald-500/15 text-emerald-500"
              : "bg-rose-500/15 text-rose-500")
          }
        >
          <Icon className="size-3.5" />
        </span>
        <span className="text-[0.7rem] text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1.5 text-lg font-semibold tabular-nums">{value}</p>
    </GlassCard>
  );
}
