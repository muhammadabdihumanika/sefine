import { LoansClient, type LoanRow } from "@/components/loans/loans-client";
import { requireActiveOrg } from "@/lib/session";
import { createClient } from "@/utils/supabase/server";

export default async function LoansPage() {
  const ctx = await requireActiveOrg();
  const active = ctx.memberships.find(
    (m) => m.organization_id === ctx.activeOrgId,
  )!;

  const supabase = await createClient();
  const { data } = await supabase
    .from("loans")
    .select(
      "id,direction,counterparty,principal,currency,interest_rate,term_months,start_date,status",
    )
    .eq("organization_id", ctx.activeOrgId)
    .order("created_at", { ascending: false });

  return (
    <LoansClient
      loans={(data ?? []) as LoanRow[]}
      activeOrgId={ctx.activeOrgId!}
      currency={active.organization.base_currency}
      canManage={["owner", "admin"].includes(active.role)}
    />
  );
}
