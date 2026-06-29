"use client";

import Link from "next/link";
import { SparklesIcon } from "lucide-react";

import type { Membership } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { OrgSwitcher } from "@/components/shell/org-switcher";
import { ThemeToggle } from "@/components/shell/theme-toggle";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={
        "grid size-7 place-items-center rounded-lg bg-gradient-to-br from-sky-400 to-blue-700 text-sm font-bold text-white shadow-sm ring-1 ring-white/30 " +
        (className ?? "")
      }
    >
      S
    </span>
  );
}

export function TopBar({
  activeOrg,
  memberships,
}: {
  activeOrg: Membership["organization"] | null;
  memberships: Membership[];
}) {
  return (
    <header className="sticky top-0 z-40 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="glass flex h-12 items-center justify-between rounded-2xl px-2">
        <OrgSwitcher activeOrg={activeOrg} memberships={memberships} />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            render={<Link href="/chat" />}
            nativeButton={false}
            aria-label="Asisten AI"
          >
            <SparklesIcon className="size-4" />
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
