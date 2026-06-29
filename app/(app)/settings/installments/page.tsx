import { can } from "@/lib/rbac/permissions";
import { requireActiveOrg } from "@/lib/session";
import { createClient } from "@/utils/supabase/server";
import {
  InstallmentsClient,
  type InstallmentRow,
} from "@/components/installments/installments-client";

export default async function InstallmentsPage() {
  const ctx = await requireActiveOrg();
  const active = ctx.memberships.find(
    (m) => m.organization_id === ctx.activeOrgId,
  )!;
  const role = active.role;

  const supabase = await createClient();
  const { data } = await supabase
    .from("installments")
    .select(
      "id,name,counterparty,installment_amount,principal,currency,term_months,paid_count,next_due_date,status",
    )
    .eq("organization_id", ctx.activeOrgId)
    .order("status", { ascending: true })
    .order("next_due_date", { ascending: true });

  return (
    <InstallmentsClient
      installments={(data ?? []) as InstallmentRow[]}
      activeOrgId={ctx.activeOrgId!}
      currency={active.organization.base_currency}
      canManage={["owner", "admin"].includes(role)}
      canPay={can(role, "bill.pay")}
    />
  );
}
