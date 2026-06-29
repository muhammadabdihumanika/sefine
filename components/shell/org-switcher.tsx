"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setActiveOrganization } from "@/app/actions/org";
import type { Membership } from "@/lib/session";

export function OrgSwitcher({
  activeOrg,
  memberships,
}: {
  activeOrg: Membership["organization"] | null;
  memberships: Membership[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!activeOrg) {
    return (
      <Button variant="ghost" size="sm" render={<Link href="/welcome" />} nativeButton={false}>
        Mulai
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" className="gap-1.5 px-2" />}
      >
        <span className="grid size-6 place-items-center rounded-md bg-primary/15 text-[0.6rem] font-bold text-primary">
          {activeOrg.name.slice(0, 2).toUpperCase()}
        </span>
        <span className="max-w-[8rem] truncate text-sm font-medium">
          {activeOrg.name}
        </span>
        <ChevronDownIcon className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="glass-strong w-64"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Organisasi Anda</DropdownMenuLabel>
          {memberships.map((m) => (
            <DropdownMenuItem
              key={m.id}
              disabled={pending || m.organization_id === activeOrg.id}
              onClick={() =>
                startTransition(async () => {
                  const res = await setActiveOrganization(m.organization_id);
                  if (res?.error) {
                    toast.error(res.error);
                    return;
                  }
                  router.refresh();
                })
              }
            >
              <span className="flex-1 truncate">{m.organization.name}</span>
              {m.organization_id === activeOrg.id && (
                <CheckIcon className="size-4 text-primary" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/welcome" />}>
            <PlusIcon /> Buat organisasi baru
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/settings/members" />}>
            <UsersIcon /> Kelola anggota
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
