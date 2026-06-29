"use client";

import * as React from "react";
import { useActionState } from "react";
import { PiggyBankIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassCard } from "@/components/glass/glass-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Picker } from "@/components/ui/picker";
import { createBudget, deleteBudget } from "@/app/actions/recurring";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export type BudgetRow = {
  id: string;
  name: string | null;
  amount: number;
  spent: number;
  category_name: string | null;
  period: string;
};

export function BudgetsClient({
  budgets,
  categories,
  currency,
  canManage,
}: {
  budgets: BudgetRow[];
  categories: { id: string; name: string }[];
  currency: string;
  canManage: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [catId, setCatId] = React.useState<string | null>(null);
  const [period, setPeriod] = React.useState("monthly");
  const [state, action] = useActionState(createBudget, { error: undefined });

  React.useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);
  React.useEffect(() => {
    if (state?.ok) {
      toast.success("Anggaran dibuat");
      setOpen(false);
    }
  }, [state]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold">Anggaran</h1>
        {canManage && (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={<Button size="sm"><PlusIcon className="size-4" />Tambah</Button>}
            />
            <SheetContent
              side="bottom"
              className="glass-strong inset-x-0 mx-auto max-w-md rounded-b-none rounded-t-3xl p-0"
            >
              <SheetHeader className="px-5 pt-5">
                <SheetTitle className="text-lg">Tambah anggaran</SheetTitle>
                <SheetDescription>
                  Batasi pengeluaran per kategori atau keseluruhan.
                </SheetDescription>
              </SheetHeader>
              <form action={action} className="space-y-3 px-5 pb-8 pt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="b-name">Nama (opsional)</Label>
                  <Input id="b-name" name="name" placeholder="cth. Makan bulanan" className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Kategori (opsional)</Label>
                  <Picker
                    value={catId}
                    placeholder="Keseluruhan"
                    options={categories.map((c) => ({ value: c.id, label: c.name }))}
                    onChange={setCatId}
                  />
                  <input type="hidden" name="category_id" value={catId ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Periode</Label>
                  <Picker
                    value={period}
                    placeholder="Periode"
                    options={[
                      { value: "monthly", label: "Bulanan" },
                      { value: "weekly", label: "Mingguan" },
                      { value: "yearly", label: "Tahunan" },
                    ]}
                    onChange={setPeriod}
                  />
                  <input type="hidden" name="period" value={period} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="b-amount">Batas</Label>
                  <Input id="b-amount" name="amount" required inputMode="numeric" placeholder="0" className="h-11" />
                </div>
                <Button type="submit" size="lg" className="h-12 w-full">
                  Simpan anggaran
                </Button>
              </form>
            </SheetContent>
          </Sheet>
        )}
      </div>

      {budgets.length === 0 ? (
        <GlassCard className="flex flex-col items-center gap-2 p-10 text-center">
          <PiggyBankIcon className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">Belum ada anggaran</p>
          <p className="text-xs text-muted-foreground">
            Atur batas pengeluaran agar lebih tertib.
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {budgets.map((b) => {
            const pct = b.amount > 0 ? Math.min(100, (b.spent / b.amount) * 100) : 0;
            const over = b.spent > b.amount;
            return (
              <GlassCard key={b.id} variant="subtle" className="p-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {b.name || b.category_name || "Anggaran keseluruhan"}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatCurrency(b.spent, currency)} / {formatCurrency(b.amount, currency)}
                    </p>
                  </div>
                  {canManage && (
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label="Hapus anggaran">
                          <Trash2Icon className="size-4 text-muted-foreground" />
                        </Button>
                      }
                      title="Hapus anggaran?"
                      onConfirm={async () => {
                        const r = await deleteBudget(b.id);
                        if (r?.error) toast.error(r.error);
                        else toast.success("Anggaran dihapus");
                      }}
                    />
                  )}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", over ? "bg-rose-500" : "bg-primary")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
