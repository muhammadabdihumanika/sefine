import {
  KeuanganClient,
  type Obligation,
} from "@/components/keuangan/keuangan-client";
import type { RecurringIncome } from "@/components/keuangan/recurring-incomes-section";
import type { BudgetRow } from "@/components/budgets/budgets-client";
import type { GoalRow } from "@/components/goals/goals-client";
import { requireActiveOrg } from "@/lib/session";
import { createClient } from "@/utils/supabase/server";

export default async function KeuanganPage() {
  const ctx = await requireActiveOrg();
  const orgId = ctx.activeOrgId!;
  const active = ctx.memberships.find(
    (m) => m.organization_id === orgId,
  )!;
  const currency = active.organization.base_currency;

  const supabase = await createClient();
  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  )
    .toISOString()
    .slice(0, 10);

  const [billsRes, instRes, loansRes, riRes, budgetsRes, catsRes, txRes, goalsRes] =
    await Promise.all([
      supabase
        .from("bills")
        .select(
          "id,name,amount,currency,frequency,next_due_date,end_date,is_paid, account:accounts(name)",
        )
        .eq("organization_id", orgId)
        .order("next_due_date", { ascending: true }),
      supabase
        .from("installments")
        .select(
          "id,name,counterparty,installment_amount,currency,term_months,paid_count,next_due_date,status",
        )
        .eq("organization_id", orgId)
        .order("next_due_date", { ascending: true }),
      supabase
        .from("loans")
        .select(
          "id,direction,counterparty,principal,currency,interest_rate,term_months,start_date,status",
        )
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false }),
      supabase
        .from("recurring_incomes")
        .select(
          "id,name,amount,currency,frequency,next_due_date,end_date,is_active, account:accounts(id,name), category:categories(id,name)",
        )
        .eq("organization_id", orgId)
        .order("next_due_date", { ascending: true }),
      supabase
        .from("budgets")
        .select("id,name,amount,category_id,period")
        .eq("organization_id", orgId)
        .eq("is_active", true),
      supabase
        .from("categories")
        .select("id,name")
        .eq("organization_id", orgId)
        .eq("type", "expense")
        .order("name"),
      supabase
        .from("transactions")
        .select("amount,category_id")
        .eq("organization_id", orgId)
        .eq("type", "expense")
        .is("deleted_at", null)
        .gte("transaction_date", monthStart),
      supabase
        .from("savings_goals")
        .select(
          "id,name,target_amount,current_amount,currency,target_date,is_completed",
        )
        .eq("organization_id", orgId)
        .order("is_completed", { ascending: true })
        .order("target_date", { ascending: true, nullsFirst: false }),
    ]);

  // ---- merged obligations ----
  const obligations: Obligation[] = [];
  for (const b of (billsRes.data ?? []) as unknown as Array<{
    id: string; name: string; amount: number; currency: string;
    frequency: string; next_due_date: string; end_date: string | null;
    is_paid: boolean; account: { name: string } | null;
  }>) {
    obligations.push({
      id: b.id, kind: "bill", name: b.name, amount: Number(b.amount),
      currency: b.currency, date: b.next_due_date, isPaid: b.is_paid,
      accountName: b.account?.name ?? null, frequency: b.frequency, endDate: b.end_date,
    });
  }
  for (const i of (instRes.data ?? []) as unknown as Array<{
    id: string; name: string; counterparty: string | null;
    installment_amount: number; currency: string; term_months: number;
    paid_count: number; next_due_date: string; status: string;
  }>) {
    obligations.push({
      id: i.id, kind: "installment", name: i.name, amount: Number(i.installment_amount),
      currency: i.currency, date: i.next_due_date, isPaid: i.status === "paid",
      term: i.term_months, paidCount: i.paid_count, counterparty: i.counterparty,
    });
  }
  for (const l of (loansRes.data ?? []) as unknown as Array<{
    id: string; direction: "lent" | "borrowed"; counterparty: string | null;
    principal: number; currency: string; interest_rate: number | null;
    term_months: number | null; start_date: string; status: string;
  }>) {
    obligations.push({
      id: l.id, kind: "loan",
      name: l.counterparty || (l.direction === "lent" ? "Piutang" : "Pinjaman"),
      amount: Number(l.principal), currency: l.currency, date: l.start_date,
      isPaid: l.status !== "active", isLent: l.direction === "lent",
      term: l.term_months, rate: l.interest_rate, counterparty: l.counterparty,
    });
  }

  // ---- budgets with spent this month ----
  const spentByCat = new Map<string, number>();
  let totalExpense = 0;
  for (const t of (txRes.data ?? []) as Array<{
    amount: number; category_id: string | null;
  }>) {
    totalExpense += Number(t.amount);
    if (t.category_id) {
      spentByCat.set(
        t.category_id,
        (spentByCat.get(t.category_id) ?? 0) + Number(t.amount),
      );
    }
  }
  const catName = new Map(
    (catsRes.data ?? []).map((c: { id: string; name: string }) => [c.id, c.name]),
  );
  const budgetRows: BudgetRow[] = (budgetsRes.data ?? []).map(
    (b: {
      id: string; name: string | null; amount: number;
      category_id: string | null; period: string;
    }) => ({
      id: b.id, name: b.name, amount: Number(b.amount), period: b.period,
      category_name: b.category_id ? catName.get(b.category_id) ?? null : null,
      spent: b.category_id ? spentByCat.get(b.category_id) ?? 0 : totalExpense,
    }),
  );

  const goals = (goalsRes.data ?? []) as GoalRow[];
  const incomes = (riRes.data ?? []) as unknown as RecurringIncome[];

  return (
    <KeuanganClient
      obligations={obligations}
      incomes={incomes}
      budgets={budgetRows}
      categories={(catsRes.data ?? []) as { id: string; name: string }[]}
      goals={goals}
      currency={currency}
      role={active.role}
      activeOrgId={orgId}
    />
  );
}
