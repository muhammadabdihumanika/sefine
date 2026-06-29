"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState, useTransition } from "react";
import {
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  RefreshCwIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/glass/glass-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS, type Role } from "@/lib/rbac/permissions";
import { formatDate } from "@/lib/format";
import {
  addMemberByEmail,
  leaveOrganization,
  regenerateInviteCode,
  removeMember,
  updateMemberRole,
} from "@/app/actions/org";

export type MemberRow = {
  id: string;
  user_id: string;
  role: Role;
  joined_at: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

export function MembersClient({
  org,
  members,
  currentUserId,
  currentRole,
}: {
  org: { id: string; name: string; invite_code: string };
  members: MemberRow[];
  currentUserId: string;
  currentRole: Role;
}) {
  const canManage = currentRole === "owner" || currentRole === "admin";
  const canChangeRole = currentRole === "owner";
  const [, startTransition] = useTransition();
  const [inviteCode, setInviteCode] = React.useState(org.invite_code);

  const [addState, addFormAction] = useActionState(addMemberByEmail, {
    error: undefined,
  });
  React.useEffect(() => {
    if (addState?.error) toast.error(addState.error);
  }, [addState]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      toast.success("Kode disalin");
    } catch {
      toast.error("Gagal menyalin");
    }
  }

  async function regen() {
    const res = await regenerateInviteCode(org.id);
    if (res?.error) toast.error(res.error);
    else if (res.code) {
      setInviteCode(res.code);
      toast.success("Kode undangan baru dibuat");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" render={<Link href="/settings" />} nativeButton={false}>
          <ArrowLeftIcon className="size-4" />
        </Button>
        <h1 className="font-heading text-xl font-semibold">Anggota &amp; Peran</h1>
      </div>

      <GlassCard className="p-4">
        <p className="text-sm font-medium">Kode undangan</p>
        <p className="text-xs text-muted-foreground">
          Bagikan kode ini agar orang bisa bergabung ke organisasi.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="flex-1 rounded-lg bg-muted px-3 py-2 text-center font-mono text-lg tracking-[0.3em]">
            {inviteCode}
          </code>
          <Button variant="outline" size="icon" onClick={copyCode} aria-label="Salin kode">
            <CopyIcon className="size-4" />
          </Button>
          {canManage && (
            <Button variant="outline" size="icon" onClick={regen} aria-label="Buat kode baru">
              <RefreshCwIcon className="size-4" />
            </Button>
          )}
        </div>
      </GlassCard>

      {canManage && (
        <GlassCard className="p-4">
          <p className="text-sm font-medium">Tambah anggota lewat email</p>
          <p className="text-xs text-muted-foreground">
            Untuk pengguna yang sudah terdaftar. Jika belum, bagikan kode
            undangan agar mereka mendaftar dulu.
          </p>
          <form action={addFormAction} className="mt-3 flex gap-2">
            <input type="hidden" name="org_id" value={org.id} />
            <Input
              name="email"
              type="email"
              required
              placeholder="email@contoh.com"
              className="h-10"
            />
            <SubmitButton size="lg">
              <UserPlusIcon className="size-4" />
              Tambah
            </SubmitButton>
          </form>
        </GlassCard>
      )}

      <div className="space-y-2">
        {members.map((m) => {
          const isSelf = m.user_id === currentUserId;
          const displayName = m.full_name || m.email || "Pengguna";
          return (
            <GlassCard
              key={m.id}
              variant="subtle"
              className="flex items-center gap-3 p-3"
            >
              <Avatar name={displayName} url={m.avatar_url} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {displayName}
                  {isSelf && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      (Anda)
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {m.email} · gabung {formatDate(m.joined_at)}
                </p>
              </div>
              {canChangeRole && !isSelf ? (
                <RoleMenu
                  role={m.role}
                  onChange={(r) =>
                    startTransition(async () => {
                      const res = await updateMemberRole(m.id, r);
                      if (res?.error) toast.error(res.error);
                    })
                  }
                />
              ) : (
                <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                  {ROLE_LABELS[m.role]}
                </Badge>
              )}
              {canManage && !isSelf && (
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon" aria-label="Keluarkan anggota">
                      <UserMinusIcon className="size-4 text-destructive" />
                    </Button>
                  }
                  title="Keluarkan anggota?"
                  description="Anggota tidak akan lagi bisa mengakses organisasi ini."
                  confirmText="Keluarkan"
                  onConfirm={async () => {
                    const res = await removeMember(m.id);
                    if (res?.error) toast.error(res.error);
                  }}
                />
              )}
            </GlassCard>
          );
        })}
      </div>

      <div className="pt-2">
        <Button
          variant="ghost"
          className="w-full text-destructive hover:text-destructive"
          onClick={() =>
            startTransition(async () => {
              const res = await leaveOrganization(org.id);
              if (res?.error) toast.error(res.error);
            })
          }
        >
          Keluar dari organisasi
        </Button>
      </div>
    </div>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className="size-9 shrink-0 rounded-full object-cover"
      />
    );
  }
  const initials =
    name
      .split(" ")
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
      {initials}
    </span>
  );
}

function RoleMenu({
  role,
  onChange,
}: {
  role: Role;
  onChange: (role: Role) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="xs" />}>
        {ROLE_LABELS[role]}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(["owner", "admin", "member", "viewer"] as Role[]).map((r) => (
          <DropdownMenuItem key={r} onClick={() => onChange(r)}>
            {ROLE_LABELS[r]}
            {r === role && <CheckIcon className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
