import { AccountsClient, type AccountRow } from "@/components/accounts/accounts-client";
import { can } from "@/lib/rbac/permissions";
import { requireActiveOrg } from "@/lib/session";
import { createClient } from "@/utils/supabase/server";

export default async function AccountsPage() {
  const ctx = await requireActiveOrg();
  const active = ctx.memberships.find(
    (m) => m.organization_id === ctx.activeOrgId,
  )!;

  const supabase = await createClient();
  const { data } = await supabase
    .from("account_balances")
    .select("*")
    .eq("organization_id", ctx.activeOrgId)
    .order("name");

  return (
    <AccountsClient
      accounts={(data ?? []) as AccountRow[]}
      canManage={can(active.role, "account.manage")}
      canReconcile={can(active.role, "transaction.create")}
      currency={active.organization.base_currency}
    />
  );
}
