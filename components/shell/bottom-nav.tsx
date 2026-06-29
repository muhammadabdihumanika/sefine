"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, LayoutGridIcon, PlusIcon, ReceiptIcon, UserIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { cn } from "@/lib/utils";
import { showInterstitial } from "@/lib/ads";
import { useQuickAdd } from "@/components/transactions/quick-add-provider";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  active: (pathname: string) => boolean;
};

const navLinks: NavItem[] = [
  { href: "/", label: "Beranda", icon: HomeIcon, active: (p) => p === "/" },
  {
    href: "/transactions",
    label: "Transaksi",
    icon: ReceiptIcon,
    active: (p) => p.startsWith("/transactions"),
  },
  {
    href: "/keuangan",
    label: "Keuangan",
    icon: LayoutGridIcon,
    active: (p) =>
      p.startsWith("/keuangan") ||
      p.startsWith("/bills") ||
      p.startsWith("/settings/loans") ||
      p.startsWith("/settings/installments") ||
      p.startsWith("/settings/budgets") ||
      p.startsWith("/settings/goals"),
  },
  {
    href: "/settings",
    label: "Saya",
    icon: UserIcon,
    active: (p) =>
      p.startsWith("/settings") &&
      !p.startsWith("/settings/loans") &&
      !p.startsWith("/settings/installments") &&
      !p.startsWith("/settings/budgets") &&
      !p.startsWith("/settings/goals"),
  },
];

function NavLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className="flex flex-1 flex-col items-center gap-0.5 py-1.5"
    >
      <Icon
        className={cn(
          "size-5 transition-colors",
          active ? "text-primary" : "text-muted-foreground",
        )}
      />
      <span
        className={cn(
          "text-[0.65rem] font-medium transition-colors",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        {item.label}
      </span>
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const { openQuickAdd } = useQuickAdd();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="glass-strong mx-auto flex max-w-md items-center justify-around rounded-2xl px-2">
        {navLinks.slice(0, 2).map((item) => (
          <NavLink key={item.href} item={item} active={item.active(pathname)} />
        ))}

        <div className="flex flex-1 justify-center">
          <button
            type="button"
            onClick={() => openQuickAdd()}
            aria-label="Tambah transaksi"
            className="grid size-12 -translate-y-3 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg ring-4 ring-background/50 transition-transform active:scale-95"
          >
            <PlusIcon className="size-6" />
          </button>
        </div>

        {navLinks.slice(2).map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={item.active(pathname)}
            onClick={item.href === "/settings" ? () => showInterstitial() : undefined}
          />
        ))}
      </div>
    </nav>
  );
}
