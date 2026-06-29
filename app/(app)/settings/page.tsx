import Link from "next/link";
import {
  BotIcon,
  Building2Icon,
  ChevronRightIcon,
  CoinsIcon,
  LogOutIcon,
  PaletteIcon,
  TagIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/glass/glass-card";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { signOut } from "@/app/actions/auth";
import { requireActiveOrg } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/rbac/permissions";

type MenuItem = {
  href: string;
  label: string;
  desc: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const menu: MenuItem[] = [
  {
    href: "/settings/organizations",
    label: "Organisasi",
    desc: "Kelola, hapus, atau keluar organisasi",
    icon: Building2Icon,
  },
  {
    href: "/settings/members",
    label: "Anggota & peran",
    desc: "Kelola siapa bisa akses organisasi",
    icon: UsersIcon,
  },
  {
    href: "/settings/categories",
    label: "Kategori",
    desc: "Atur kategori pemasukan & pengeluaran",
    icon: TagIcon,
  },
  {
    href: "/settings/accounts",
    label: "Rekening",
    desc: "Kas, bank, e-wallet",
    icon: WalletIcon,
  },
  {
    href: "/settings/integrations",
    label: "WhatsApp & AI",
    desc: "Asisten chat & provider AI",
    icon: BotIcon,
  },
  {
    href: "/settings/appearance",
    label: "Tampilan",
    desc: "Tema terang/gelap",
    icon: PaletteIcon,
  },
];

export default async function SettingsPage() {
  const ctx = await requireActiveOrg();
  const active = ctx.memberships.find(
    (m) => m.organization_id === ctx.activeOrgId,
  );

  const items = ctx.isSuperAdmin
    ? [
        {
          href: "/settings/credits",
          label: "Penggunaan kredit AI",
          desc: "Token/credit per pengguna (admin platform)",
          icon: CoinsIcon,
        },
        ...menu,
      ]
    : menu;

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-xl font-semibold">Pengaturan</h1>

      <GlassCard className="p-4">
        <p className="text-xs text-muted-foreground">Organisasi aktif</p>
        <p className="font-medium">{active?.organization.name}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Peran Anda: {active ? ROLE_LABELS[active.role] : "-"} · {ctx.email}
          {ctx.isSuperAdmin ? " · Super admin" : ""}
        </p>
      </GlassCard>

      <div className="space-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="glass flex items-center gap-3 rounded-2xl p-3 text-left transition active:scale-[0.99]"
            >
              <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {item.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.desc}
                </span>
              </span>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </Link>
          );
        })}
      </div>

      <p className="px-1 text-center text-[0.7rem] text-muted-foreground">
        Tagihan, Pinjaman, Cicilan, Anggaran & Target ada di menu{" "}
        <span className="font-medium text-foreground">Keuangan</span> di bilah bawah.
      </p>

      <InstallPrompt />

      <form action={signOut}>
        <Button
          type="submit"
          variant="ghost"
          className="w-full text-destructive hover:text-destructive"
        >
          <LogOutIcon className="size-4" /> Keluar
        </Button>
      </form>
    </div>
  );
}
