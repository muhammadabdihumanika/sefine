import type { Metadata } from "next";

import { MobileShell } from "@/components/shell/mobile-shell";
import { requireActiveOrg } from "@/lib/session";

export const metadata: Metadata = {
  title: "Beranda",
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireActiveOrg();
  const active = ctx.memberships.find(
    (m) => m.organization_id === ctx.activeOrgId,
  );

  return (
    <MobileShell
      activeOrgId={ctx.activeOrgId!}
      activeOrg={active?.organization ?? null}
      memberships={ctx.memberships}
    >
      {children}
    </MobileShell>
  );
}
