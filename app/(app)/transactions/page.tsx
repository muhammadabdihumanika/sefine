import { requireActiveOrg } from "@/lib/session";
import { createClient } from "@/utils/supabase/server";
import { can } from "@/lib/rbac/permissions";
import { AdBanner } from "@/components/ads/ad-banner";
import {
  TransactionList,
  type TxRow,
} from "@/components/transactions/transaction-list";

export default async function TransactionsPage() {
  const ctx = await requireActiveOrg();
  const active = ctx.memberships.find(
    (m) => m.organization_id === ctx.activeOrgId,
  )!;

  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select(
      "id,type,amount,description,transaction_date,created_at,organization_id, account:accounts(id,name), category:categories(id,name,type)",
    )
    .eq("organization_id", ctx.activeOrgId)
    .is("deleted_at", null)
    .in("type", ["income", "expense", "transfer_debit"])
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(0, 199);

  return (
    <div className="space-y-4">
      <AdBanner />
      <h1 className="font-heading text-xl font-semibold">Transaksi</h1>
      <TransactionList
        transactions={(data ?? []) as unknown as TxRow[]}
        canDelete={can(active.role, "transaction.delete")}
      />
    </div>
  );
}
