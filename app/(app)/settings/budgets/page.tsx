import { BudgetsClient, type BudgetRow } from "@/components/budgets/budgets-client";
import { requireActiveOrg } from "@/lib/session";
import { createClient } from "@/utils/supabase/server";

export default async function BudgetsPage() {
  const ctx = await requireActiveOrg();
  const active = ctx.memberships.find(
    (m) => m.organization_id === ctx.activeOrgId,
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

  const [budgetsRes, catsRes, txRes] = await Promise.all([
    supabase
      .from("budgets")
      .select("id,name,amount,category_id,period")
      .eq("organization_id", ctx.activeOrgId)
      .eq("is_active", true),
    supabase
      .from("categories")
      .select("id,name")
      .eq("organization_id", ctx.activeOrgId)
      .eq("type", "expense")
      .order("name"),
    supabase
      .from("transactions")
      .select("amount,category_id")
      .eq("organization_id", ctx.activeOrgId)
      .eq("type", "expense")
      .is("deleted_at", null)
      .gte("transaction_date", monthStart),
  ]);

  const spentByCat = new Map<string, number>();
  let totalExpense = 0;
  for (const t of (txRes.data ?? []) as Array<{
    amount: number;
    category_id: string | null;
  }>) {
    totalExpense += Number(t.amount);
    if (t.category_id)
      spentByCat.set(
        t.category_id,
        (spentByCat.get(t.category_id) ?? 0) + Number(t.amount),
      );
  }
  const catName = new Map(
    (catsRes.data ?? []).map((c: { id: string; name: string }) => [c.id, c.name]),
  );

  const rows: BudgetRow[] = (budgetsRes.data ?? []).map(
    (b: {
      id: string;
      name: string | null;
      amount: number;
      category_id: string | null;
      period: string;
    }) => ({
      id: b.id,
      name: b.name,
      amount: Number(b.amount),
      period: b.period,
      category_name: b.category_id ? catName.get(b.category_id) ?? null : null,
      spent: b.category_id
        ? spentByCat.get(b.category_id) ?? 0
        : totalExpense,
    }),
  );

  return (
    <BudgetsClient
      budgets={rows}
      categories={(catsRes.data ?? []) as { id: string; name: string }[]}
      currency={currency}
      canManage={["owner", "admin", "member"].includes(active.role)}
    />
  );
}
