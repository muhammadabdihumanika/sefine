"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CheckIcon, LogOutIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/glass/glass-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  deleteOrganization,
  leaveOrganization,
  setActiveOrganization,
} from "@/app/actions/org";
import { ROLE_LABELS, type Role } from "@/lib/rbac/permissions";
import type { Membership } from "@/lib/session";

/**
 * Manage all of the user's organizations: switch active, delete (owner), or
 * leave (non-owner). Removal is only allowed when the user has more than one
 * org AND the target is not the currently-active one (switch off it first).
 */
export function OrganizationsClient({
  memberships,
  activeOrgId,
}: {
  memberships: Membership[];
  activeOrgId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const onlyOne = memberships.length <= 1;

  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-heading text-xl font-semibold">Kelola organisasi</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {memberships.length} organisasi · hapus/keluar hanya bila ada lebih
          dari satu.
        </p>
      </div>

      {onlyOne && (
        <GlassCard className="p-3 text-xs text-muted-foreground">
          Anda hanya punya satu organisasi. Buat atau gabung organisasi lain
          lebih dulu sebelum bisa menghapusnya.
        </GlassCard>
      )}

      <div className="space-y-2">
        {memberships.map((m) => (
          <OrgRow
            key={m.id}
            m={m}
            isActive={m.organization_id === activeOrgId}
            canRemove={!onlyOne && m.organization_id !== activeOrgId}
            pending={pending}
            onActivate={() =>
              start(async () => {
                const res = await setActiveOrganization(m.organization_id);
                if (res?.error) toast.error(res.error);
                else {
                  toast.success("Organisasi aktif diganti");
                  router.refresh();
                }
              })
            }
            onDelete={() =>
              start(async () => {
                const res = await deleteOrganization(m.organization_id);
                if (res?.error) toast.error(res.error);
                else {
                  toast.success("Organisasi dihapus permanen");
                  router.refresh();
                }
              })
            }
            onLeave={() =>
              start(async () => {
                const res = await leaveOrganization(m.organization_id);
                if (res?.error) toast.error(res.error);
                // success → action redirects to "/"
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function OrgRow({
  m,
  isActive,
  canRemove,
  pending,
  onActivate,
  onDelete,
  onLeave,
}: {
  m: Membership;
  isActive: boolean;
  canRemove: boolean;
  pending: boolean;
  onActivate: () => void;
  onDelete: () => void;
  onLeave: () => void;
}) {
  const isOwner = m.role === "owner";
  const initials = m.organization.name.slice(0, 2).toUpperCase();

  return (
    <GlassCard variant="subtle" className="p-3">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium">{m.organization.name}</p>
            {isActive && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[0.6rem] font-medium text-primary">
                <CheckIcon className="size-2.5" /> Aktif
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {ROLE_LABELS[m.role as Role]}
          </p>
        </div>
        {!isActive && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={onActivate}
          >
            Aktifkan
          </Button>
        )}
      </div>

      <div className="mt-2 flex items-center justify-end gap-2">
        {isOwner ? (
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="sm"
                disabled={!canRemove || pending}
                className="text-destructive hover:text-destructive"
              >
                <Trash2Icon className="size-4" />
                Hapus organisasi
              </Button>
            }
            title={`Hapus "${m.organization.name}"?`}
            description="Semua data — transaksi, rekening, tagihan, cicilan, anggota — dihapus permanen dan tidak dapat dikembalikan."
            confirmText="Hapus permanen"
            onConfirm={onDelete}
          />
        ) : (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm" disabled={!canRemove || pending}>
                <LogOutIcon className="size-4" />
                Keluar
              </Button>
            }
            title={`Keluar dari "${m.organization.name}"?`}
            description="Anda tidak akan bisa mengakses data organisasi ini lagi. Minta kode undangan dari owner jika ingin kembali nanti."
            confirmText="Keluar"
            destructive={false}
            onConfirm={onLeave}
          />
        )}
      </div>

      {isActive && (
        <p className="mt-1 text-right text-[0.65rem] text-muted-foreground">
          Beralih ke organisasi lain sebelum menghapus/keluar.
        </p>
      )}
    </GlassCard>
  );
}
