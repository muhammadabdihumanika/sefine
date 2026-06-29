"use client";

import type { Membership } from "@/lib/session";
import { BottomNav } from "@/components/shell/bottom-nav";
import { TopBar } from "@/components/shell/top-bar";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { QuickAddProvider } from "@/components/transactions/quick-add-provider";

export function MobileShell({
  activeOrgId,
  activeOrg,
  memberships,
  children,
}: {
  activeOrgId: string;
  activeOrg: Membership["organization"] | null;
  memberships: Membership[];
  children: React.ReactNode;
}) {
  return (
    <QuickAddProvider activeOrgId={activeOrgId}>
      <LiveRefresh orgId={activeOrgId} />
      <div className="relative flex min-h-[100dvh] flex-col">
        <TopBar activeOrg={activeOrg} memberships={memberships} />
        <main className="flex-1 px-4 pb-28 pt-4">{children}</main>
        <BottomNav />
      </div>
    </QuickAddProvider>
  );
}
