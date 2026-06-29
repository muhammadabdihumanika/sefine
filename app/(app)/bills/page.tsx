import { BillsClient, type BillRow } from "@/components/bills/bills-client";
import { can } from "@/lib/rbac/permissions";
import { requireActiveOrg } from "@/lib/session";
import { createClient } from "@/utils/supabase/server";

export default async function BillsPage() {
  const ctx = await requireActiveOrg();
  const active = ctx.memberships.find(
    (m) => m.organization_id === ctx.activeOrgId,
  )!;
  const role = active.role;

  const supabase = await createClient();
  const { data } = await supabase
    .from("bills")
    .select(
      "id,name,amount,currency,frequency,next_due_date,end_date,is_paid, account:accounts(id,name)",
    )
    .eq("organization_id", ctx.activeOrgId)
    .order("next_due_date", { ascending: true });

  return (
    <BillsClient
      bills={(data ?? []) as unknown as BillRow[]}
      activeOrgId={ctx.activeOrgId!}
      currency={active.organization.base_currency}
      canManage={role === "owner" || role === "admin"}
      canPay={can(role, "bill.pay")}
    />
  );
}
