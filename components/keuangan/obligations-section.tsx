"use client";

import * as React from "react";
import { useTransition } from "react";
import {
  CalendarClockIcon,
  CheckIcon,
  CreditCardIcon,
  HandCoinsIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/glass/glass-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AddObligationSheet } from "@/components/keuangan/add-obligation-sheet";
import {
  deleteBill,
  deleteInstallment,
  deleteLoan,
  payBill,
  payInstallment,
  setLoanStatus,
} from "@/app/actions/recurring";
import { formatCurrency, formatRelativeDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Obligation } from "@/components/keuangan/keuangan-client";

const KIND_LABEL: Record<Obligation["kind"], string> = {
  bill: "Tagihan",
  installment: "Cicilan",
  loan: "Pinjaman",
};
const KIND_ICON: Record<Obligation["kind"], React.ComponentType<{ className?: string }>> = {
  bill: CalendarClockIcon,
  installment: CreditCardIcon,
  loan: HandCoinsIcon,
};
const FREQ: Record<string, string> = {
  once: "Sekali",
  weekly: "Mingguan",
  monthly: "Bulanan",
  yearly: "Tahunan",
};

function formatMonthYear(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(
    new Date(y, m - 1, 1),
  );
}

function dueStatus(date: string | null, isPaid: boolean) {
  if (isPaid) return { label: "Lunas", tone: "muted" as const };
  if (!date) return { label: "—", tone: "muted" as const };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date + "T00:00:00");
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return { label: "Terlambat", tone: "rose" as const };
  if (diff === 0) return { label: "Hari ini", tone: "amber" as const };
  if (diff <= 7) return { label: `${diff} hari lagi`, tone: "amber" as const };
  return { label: formatRelativeDay(date), tone: "muted" as const };
}

const FILTERS = ["all", "bill", "installment", "loan"] as const;
type Filter = (typeof FILTERS)[number];

export function ObligationsSection({
  obligations,
  currency,
  canManage,
  canPay,
  activeOrgId,
}: {
  obligations: Obligation[];
  currency: string;
  canManage: boolean;
  canPay: boolean;
  activeOrgId: string;
}) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const [addOpen, setAddOpen] = React.useState(false);

  const inFilter = (o: Obligation) => filter === "all" || o.kind === filter;
  const active = obligations
    .filter((o) => !o.isPaid && inFilter(o))
    .slice()
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
  const done = obligations.filter((o) => o.isPaid && inFilter(o));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-heading text-xl font-semibold">Tagihan</h1>
        {canManage && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <PlusIcon className="size-4" />
            Tambah
          </Button>
        )}
      </div>

      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition",
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-muted/60 text-muted-foreground",
            )}
          >
            {f === "all" ? "Semua" : KIND_LABEL[f]}
          </button>
        ))}
      </div>

      {active.length === 0 ? (
        <GlassCard className="p-8 text-center text-sm text-muted-foreground">
          Belum ada tagihan.{" "}
          {canManage ? "Ketuk +Tambah untuk membuat." : ""}
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {active.map((o) => (
            <ObligationCard
              key={`${o.kind}-${o.id}`}
              o={o}
              currency={currency}
              canPay={canPay}
              canManage={canManage}
            />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="px-1 text-xs font-medium text-muted-foreground">
            Selesai ({done.length})
          </div>
          <div className="space-y-2 opacity-70">
            {done.map((o) => (
              <ObligationCard
                key={`${o.kind}-${o.id}`}
                o={o}
                currency={currency}
                canPay={false}
                canManage={canManage}
              />
            ))}
          </div>
        </div>
      )}

      <AddObligationSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        activeOrgId={activeOrgId}
      />
    </div>
  );
}

function ObligationCard({
  o,
  currency,
  canPay,
  canManage,
}: {
  o: Obligation;
  currency: string;
  canPay: boolean;
  canManage: boolean;
}) {
  const [, start] = useTransition();
  const Icon = KIND_ICON[o.kind];
  const status = dueStatus(o.date, o.isPaid);
  const d = o.date ? new Date(o.date + "T00:00:00") : null;
  const monthShort = d
    ? new Intl.DateTimeFormat("id-ID", { month: "short" }).format(d)
    : "";

  function pay() {
    start(async () => {
      let r: { error?: string } = {};
      if (o.kind === "bill") r = await payBill(o.id);
      else if (o.kind === "installment") r = await payInstallment(o.id);
      else r = await setLoanStatus(o.id, "paid");
      if (r?.error) toast.error(r.error);
      else toast.success(o.kind === "loan" ? "Ditandai lunas" : "Dibayar & dicatat");
    });
  }

  let meta = "";
  if (o.kind === "bill") {
    meta = [
      o.accountName ?? "Tanpa akun",
      o.frequency ? FREQ[o.frequency] ?? o.frequency : "",
      o.endDate ? `s/d ${formatMonthYear(o.endDate.slice(0, 7))}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  } else if (o.kind === "installment") {
    meta = [
      o.counterparty,
      `${o.paidCount ?? 0}/${o.term ?? 0} cicil`,
    ]
      .filter(Boolean)
      .join(" · ");
  } else {
    meta = [
      o.counterparty,
      o.term ? `${o.term} bln` : "",
      o.rate ? `${o.rate}%/th` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return (
    <GlassCard variant="subtle" className="p-3">
      <div className="flex items-center gap-3">
        {o.kind === "loan" ? (
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-full",
              o.isLent
                ? "bg-emerald-500/15 text-emerald-500"
                : "bg-rose-500/15 text-rose-500",
            )}
          >
            <Icon className="size-5" />
          </span>
        ) : d ? (
          <div
            className={cn(
              "grid w-11 shrink-0 place-items-center rounded-lg border py-1 text-center",
              status.tone === "rose"
                ? "border-rose-500/30 bg-rose-500/10 text-rose-500"
                : status.tone === "amber"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "border-border bg-muted/40 text-foreground",
            )}
          >
            <span className="text-base leading-none font-bold">{d.getDate()}</span>
            <span className="text-[0.6rem] uppercase tracking-wide">{monthShort}</span>
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-medium">{o.name}</p>
            <Badge variant="secondary" className="text-[0.55rem]">
              {KIND_LABEL[o.kind]}
            </Badge>
            {o.kind === "loan" && (
              <Badge variant={o.isLent ? "default" : "secondary"} className="text-[0.55rem]">
                {o.isLent ? "Meminjamkan" : "Dipinjam"}
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{meta}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums">
            {formatCurrency(o.amount, o.currency || currency)}
          </p>
          {!o.isPaid && (
            <Badge
              variant="secondary"
              className={cn(
                "mt-0.5 text-[0.6rem]",
                status.tone === "rose" && "bg-rose-500/15 text-rose-500",
                status.tone === "amber" && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
              )}
            >
              {status.label}
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        {!o.isPaid && canPay && (
          <Button variant="outline" size="sm" className="flex-1" onClick={pay}>
            <CheckIcon className="size-4" />
            {o.kind === "loan" ? "Tandai lunas" : "Bayar"}
          </Button>
        )}
        {canManage && (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="Hapus">
                <Trash2Icon className="size-4 text-destructive" />
              </Button>
            }
            title={`Hapus ${o.kind === "bill" ? "tagihan" : o.kind === "installment" ? "cicilan" : "pinjaman"} ini?`}
            description="Data akan dihapus permanen. Transaksi yang sudah dicatat tetap ada."
            onConfirm={async () => {
              let r: { error?: string } = {};
              if (o.kind === "bill") r = await deleteBill(o.id);
              else if (o.kind === "installment") r = await deleteInstallment(o.id);
              else r = await deleteLoan(o.id);
              if (r?.error) toast.error(r.error);
              else toast.success("Dihapus");
            }}
          />
        )}
      </div>
    </GlassCard>
  );
}
