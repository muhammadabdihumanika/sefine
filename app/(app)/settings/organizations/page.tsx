import type { Metadata } from "next";

import { OrganizationsClient } from "@/components/settings/organizations-client";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Kelola organisasi" };

export default async function OrganizationsPage() {
  const ctx = await requireUser();

  return (
    <OrganizationsClient
      memberships={ctx.memberships}
      activeOrgId={ctx.activeOrgId ?? ""}
    />
  );
}
