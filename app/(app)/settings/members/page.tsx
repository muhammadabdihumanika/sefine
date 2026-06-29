import { createClient } from "@/utils/supabase/server";
import { MembersClient, type MemberRow } from "@/components/settings/members-client";
import { requireActiveOrg } from "@/lib/session";

export default async function MembersPage() {
  const ctx = await requireActiveOrg();
  const orgId = ctx.activeOrgId!;
  const active = ctx.memberships.find((m) => m.organization_id === orgId)!;

  const supabase = await createClient();
  const { data } = await supabase.rpc("list_org_members", { p_org: orgId });

  return (
    <MembersClient
      org={{
        id: active.organization.id,
        name: active.organization.name,
        invite_code: active.organization.invite_code,
      }}
      members={(data ?? []) as MemberRow[]}
      currentUserId={ctx.userId!}
      currentRole={active.role}
    />
  );
}
