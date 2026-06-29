import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";
import type { Role } from "@/lib/rbac/permissions";

export type Membership = {
  id: string;
  organization_id: string;
  role: Role;
  organization: {
    id: string;
    name: string;
    slug: string;
    base_currency: string;
    invite_code: string;
  };
};

export type SessionContext = {
  userId: string | null;
  email: string | null;
  profile: Record<string, unknown> | null;
  activeOrgId: string | null;
  memberships: Membership[];
  isSuperAdmin: boolean;
};

/**
 * Resolves the current user, their profile, memberships, and active org.
 * Safe to call anywhere server-side; returns nulls when not authenticated or
 * when the DB schema is not yet provisioned.
 *
 * Wrapped in React `cache()` so that when both the layout and the page (and
 * any nested component) call requireActiveOrg()/requireUser() in the same
 * request, the underlying getUser() + profile + memberships queries run ONCE
 * instead of duplicating across each caller.
 */
export const getSessionContext = cache(async (): Promise<SessionContext> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      userId: null,
      email: null,
      profile: null,
      activeOrgId: null,
      memberships: [],
      isSuperAdmin: false,
    };
  }

  const [{ data: profile }, { data: memberships, error }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("organization_members")
      .select(
        "id, organization_id, role, organization:organizations(id, name, slug, base_currency, invite_code)",
      )
      .eq("user_id", user.id),
  ]);

  if (error) {
    // Schema not provisioned yet — treat as having no orgs.
    return {
      userId: user.id,
      email: user.email ?? null,
      profile,
      activeOrgId: null,
      memberships: [],
      isSuperAdmin: Boolean(profile?.is_super_admin),
    };
  }

  const list = (memberships ?? []) as unknown as Membership[];
  const activeOrgId =
    (profile?.active_organization_id as string | undefined) ??
    list[0]?.organization_id ??
    null;

  return {
    userId: user.id,
    email: user.email ?? null,
    profile,
    activeOrgId,
    memberships: list,
    isSuperAdmin: Boolean(profile?.is_super_admin),
  };
});

/** Requires an authenticated user; redirects to /login otherwise. */
export async function requireUser(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx.userId) redirect("/login");
  return ctx;
}

/** Requires the user to have an active organization; redirects to /welcome. */
export async function requireActiveOrg(): Promise<SessionContext> {
  const ctx = await requireUser();
  if (!ctx.activeOrgId) redirect("/welcome");
  return ctx;
}

export function activeMembership(ctx: SessionContext): Membership | undefined {
  return ctx.memberships.find((m) => m.organization_id === ctx.activeOrgId);
}
