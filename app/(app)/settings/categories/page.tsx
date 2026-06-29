import { CategoriesClient, type CatRow } from "@/components/categories/categories-client";
import { can } from "@/lib/rbac/permissions";
import { requireActiveOrg } from "@/lib/session";
import { createClient } from "@/utils/supabase/server";

export default async function CategoriesPage() {
  const ctx = await requireActiveOrg();
  const active = ctx.memberships.find(
    (m) => m.organization_id === ctx.activeOrgId,
  )!;

  const supabase = await createClient();
  // Seed default categories for the org if empty (idempotent).
  await supabase.rpc("ensure_default_categories", { p_org: ctx.activeOrgId });

  const { data } = await supabase
    .from("categories")
    .select("id,name,type,is_system,default_account_id")
    .eq("organization_id", ctx.activeOrgId)
    .order("type")
    .order("sort_order")
    .order("name");

  return (
    <CategoriesClient
      categories={(data ?? []) as CatRow[]}
      canManage={can(active.role, "category.manage")}
      activeOrgId={ctx.activeOrgId!}
    />
  );
}
