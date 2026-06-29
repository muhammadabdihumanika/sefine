"use client";

import * as React from "react";
import { useActionState, useTransition } from "react";
import {
  CheckIcon,
  PlusIcon,
  SkipForwardIcon,
  Trash2Icon,
  TrendingUpIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/glass/glass-card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Picker } from "@/components/ui/picker";
import { DatePicker } from "@/components/ui/date-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createClient } from "@/utils/supabase/client";
import {
  createRecurringIncome,
  deleteRecurringIncome,
  receiveRecurringIncome,
  skipRecurringIncome,
} from "@/app/actions/recurring";
import { formatCurrency, formatRelativeDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export type RecurringIncome = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  frequency: string;
  next_due_date: string;
  end_date: string | null;
  is_active: boolean;
  account: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
};

const FREQ: Record<string, string> = {
  once: "Sekali",
  weekly: "Mingguan",
  monthly: "Bulanan",
  yearly: "Tahunan",
};

function dueStatus(next: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(next + "T00:00:00");
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return { label: "Terlambat", tone: "rose" as const };
  if (diff === 0) return { label: "Hari ini", tone: "amber" as const };
  if (diff <= 7) return { label: `${diff} hari lagi`, tone: "amber" as const };
  return { label: formatRelativeDay(next), tone: "muted" as const };
}

export function RecurringIncomesSection({
  incomes,
  currency,
  canManage,
  canAct,
  activeOrgId,
}: {
  incomes: RecurringIncome[];
  currency: string;
  canManage: boolean;
  canAct: boolean;
  activeOrgId: string;
}) {
  const [, start] = useTransition();
  const [addOpen, setAddOpen] = React.useState(false);

  const active = incomes
    .filter((i) => i.is_active)
    .slice()
    .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date));
  const done = incomes.filter((i) => !i.is_active);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold">Pendapatan</h1>
        {canManage && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <PlusIcon className="size-4" /> Tambah
          </Button>
        )}
      </div>

      {active.length === 0 ? (
        <GlassCard className="p-8 text-center text-sm text-muted-foreground">
          Belum ada pendapatan berulang.{" "}
          {canManage ? "Ketuk +Tambah (mis. gaji bulanan)." : ""}
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {active.map((i) => {
            const status = dueStatus(i.next_due_date);
            const d = new Date(i.next_due_date + "T00:00:00");
            const monthShort = new Intl.DateTimeFormat("id-ID", { month: "short" }).format(d);
            return (
              <GlassCard key={i.id} variant="subtle" className="p-3">
                <div className="flex items-center gap-3">
                  <div className="grid w-11 shrink-0 place-items-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 py-1 text-center text-emerald-600 dark:text-emerald-400">
                    <span className="text-base leading-none font-bold">{d.getDate()}</span>
                    <span className="text-[0.6rem] uppercase tracking-wide">{monthShort}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{i.name}</p>
                      <Badge variant="secondary" className="text-[0.55rem]">
                        Pendapatan
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {i.account?.name ?? "Tanpa akun"}
                      {i.category ? ` · ${i.category.name}` : ""} ·{" "}
                      {FREQ[i.frequency] ?? i.frequency}
                      {i.end_date ? ` · s/d ${i.end_date}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      +{formatCurrency(Number(i.amount), i.currency || currency)}
                    </p>
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
                  </div>
                </div>

                {canAct && (
                  <div className="mt-2 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() =>
                        start(async () => {
                          const r = await receiveRecurringIncome(i.id);
                          if (r?.error) toast.error(r.error);
                          else toast.success("Pendapatan dicatat");
                        })
                      }
                    >
                      <CheckIcon className="size-4" /> Terima
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        start(async () => {
                          const r = await skipRecurringIncome(i.id);
                          if (r?.error) toast.error(r.error);
                          else toast.success("Dilewati bulan ini");
                        })
                      }
                    >
                      <SkipForwardIcon className="size-4" /> Lewati
                    </Button>
                    {canManage && (
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label="Hapus permanen">
                            <Trash2Icon className="size-4 text-destructive" />
                          </Button>
                        }
                        title="Hapus pendapatan ini permanen?"
                        description="Pendapatan berulang akan dihapus selamanya. Transaksi yang sudah dicatat tidak ikut terhapus."
                        confirmText="Hapus permanen"
                        onConfirm={async () => {
                          const r = await deleteRecurringIncome(i.id);
                          if (r?.error) toast.error(r.error);
                          else toast.success("Dihapus permanen");
                        }}
                      />
                    )}
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}

      {done.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="px-1 text-xs font-medium text-muted-foreground">
            Selesai ({done.length})
          </div>
          <div className="space-y-2 opacity-70">
            {done.map((i) => (
              <GlassCard key={i.id} variant="subtle" className="flex items-center gap-3 p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <TrendingUpIcon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {FREQ[i.frequency] ?? i.frequency} · selesai
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  +{formatCurrency(Number(i.amount), i.currency || currency)}
                </span>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      <AddRecurringIncomeSheet open={addOpen} onOpenChange={setAddOpen} activeOrgId={activeOrgId} />
    </div>
  );
}

function AddRecurringIncomeSheet({
  open,
  onOpenChange,
  activeOrgId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeOrgId: string;
}) {
  const [accountId, setAccountId] = React.useState<string | null>(null);
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [frequency, setFrequency] = React.useState("monthly");
  const [startDate, setStartDate] = React.useState<string | null>(null);
  const [endDate, setEndDate] = React.useState<string | null>(null);
  const [accounts, setAccounts] = React.useState<{ value: string; label: string }[]>([]);
  const [catOptions, setCatOptions] = React.useState<{ value: string; label: string }[]>([]);
  const [state, action] = useActionState(createRecurringIncome, { error: undefined });

  React.useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);
  React.useEffect(() => {
    if (state?.ok) {
      toast.success("Pendapatan berulang ditambahkan");
      onOpenChange(false);
    }
  }, [state, onOpenChange]);

  React.useEffect(() => {
    if (!open || !activeOrgId) return;
    const supabase = createClient();
    void (async () => {
      const [a, c] = await Promise.all([
        supabase.from("accounts").select("id,name").eq("organization_id", activeOrgId).eq("is_archived", false).order("name"),
        supabase.from("categories").select("id,name").eq("organization_id", activeOrgId).eq("type", "income").order("name"),
      ]);
      setAccounts((a.data ?? []).map((x: { id: string; name: string }) => ({ value: x.id, label: x.name })));
      setCatOptions((c.data ?? []).map((x: { id: string; name: string }) => ({ value: x.id, label: x.name })));
      setAccountId((prev) => prev ?? (a.data ?? [])[0]?.id ?? null);
    })();
  }, [open, activeOrgId]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="glass-strong inset-x-0 mx-auto max-h-[92dvh] max-w-md overflow-y-auto rounded-b-none rounded-t-3xl p-0"
      >
        <SheetHeader className="px-5 pt-5">
          <SheetTitle className="text-lg">Tambah pendapatan berulang</SheetTitle>
          <SheetDescription>
            Catat pemasukan rutin (mis. gaji). Saat diterima, ketuk “Terima”
            untuk menambahkan otomatis.
          </SheetDescription>
        </SheetHeader>
        <form action={action} className="space-y-3 px-5 pb-8 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="ri-name">Nama</Label>
            <Input id="ri-name" name="name" required placeholder="cth. Gaji bulanan" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ri-amount">Nominal</Label>
            <Input id="ri-amount" name="amount" required inputMode="numeric" placeholder="0" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Masuk ke akun</Label>
            <Picker value={accountId} placeholder="Pilih akun" options={accounts} onChange={setAccountId} />
            <input type="hidden" name="account_id" value={accountId ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Kategori (opsional)</Label>
            <Picker value={categoryId} placeholder="Tanpa kategori" options={catOptions} onChange={setCategoryId} />
            <input type="hidden" name="category_id" value={categoryId ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Frekuensi</Label>
            <Picker
              value={frequency}
              placeholder="Frekuensi"
              options={[
                { value: "monthly", label: "Bulanan" },
                { value: "weekly", label: "Mingguan" },
                { value: "yearly", label: "Tahunan" },
                { value: "once", label: "Sekali" },
              ]}
              onChange={setFrequency}
            />
            <input type="hidden" name="frequency" value={frequency} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Jatuh tempo</Label>
              <DatePicker value={startDate} onChange={setStartDate} placeholder={today} />
              <input type="hidden" name="start_date" value={startDate ?? ""} />
            </div>
            {frequency !== "once" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Sampai (opsional)</Label>
                <DatePicker value={endDate} onChange={setEndDate} />
                <input type="hidden" name="end_date" value={endDate ?? ""} />
              </div>
            )}
          </div>
          <Button type="submit" size="lg" className="h-12 w-full">Simpan</Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
