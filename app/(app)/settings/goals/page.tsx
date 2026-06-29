import { GoalsClient, type GoalRow } from "@/components/goals/goals-client";
import { requireActiveOrg } from "@/lib/session";
import { createClient } from "@/utils/supabase/server";

export default async function GoalsPage() {
  const ctx = await requireActiveOrg();
  const active = ctx.memberships.find(
    (m) => m.organization_id === ctx.activeOrgId,
  )!;

  const supabase = await createClient();
  const { data } = await supabase
    .from("savings_goals")
    .select("id,name,target_amount,current_amount,currency,target_date,is_completed")
    .eq("organization_id", ctx.activeOrgId)
    .order("is_completed", { ascending: true })
    .order("target_date", { ascending: true, nullsFirst: false });

  return (
    <GoalsClient
      goals={(data ?? []) as GoalRow[]}
      currency={active.organization.base_currency}
      canManage={["owner", "admin", "member"].includes(active.role)}
    />
  );
}
