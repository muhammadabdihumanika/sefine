"use client";

import * as React from "react";
import { useActionState, useTransition } from "react";
import { PlusIcon, TargetIcon, Trash2Icon } from "lucide-react";
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
import { contributeToGoal, createGoal, deleteGoal } from "@/app/actions/recurring";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type GoalRow = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  currency: string;
  target_date: string | null;
  is_completed: boolean;
};

export function GoalsClient({
  goals,
  currency,
  canManage,
}: {
  goals: GoalRow[];
  currency: string;
  canManage: boolean;
}) {
  const [, start] = useTransition();
  const [open, setOpen] = React.useState(false);
  const [amounts, setAmounts] = React.useState<Record<string, string>>({});
  const [state, action] = useActionState(createGoal, { error: undefined });

  React.useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);
  React.useEffect(() => {
    if (state?.ok) {
      toast.success("Target dibuat");
      setOpen(false);
    }
  }, [state]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold">Target</h1>
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
                <SheetTitle className="text-lg">Tambah target tabungan</SheetTitle>
                <SheetDescription>
                  Lacak progres menuju tujuan finansial Anda.
                </SheetDescription>
              </SheetHeader>
              <form action={action} className="space-y-3 px-5 pb-8 pt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="g-name">Nama target</Label>
                  <Input id="g-name" name="name" required placeholder="cth. Dana darurat" className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="g-target">Target nominal</Label>
                  <Input id="g-target" name="target_amount" required inputMode="numeric" placeholder="0" className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="g-date">Target tanggal (opsional)</Label>
                  <Input id="g-date" name="target_date" type="date" className="h-11" />
                </div>
                <Button type="submit" size="lg" className="h-12 w-full">
                  Simpan target
                </Button>
              </form>
            </SheetContent>
          </Sheet>
        )}
      </div>

      {goals.length === 0 ? (
        <GlassCard className="flex flex-col items-center gap-2 p-10 text-center">
          <TargetIcon className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">Belum ada target</p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {goals.map((g) => {
            const pct =
              g.target_amount > 0
                ? Math.min(100, (g.current_amount / g.target_amount) * 100)
                : 0;
            return (
              <GlassCard key={g.id} variant="subtle" className="p-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{g.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatCurrency(Number(g.current_amount), g.currency || currency)} /{" "}
                      {formatCurrency(Number(g.target_amount), g.currency || currency)}
                    </p>
                    {g.target_date && (
                      <p className="text-[0.7rem] text-muted-foreground">
                        target {formatDate(g.target_date)}
                      </p>
                    )}
                  </div>
                  {canManage && (
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label="Hapus target">
                          <Trash2Icon className="size-4 text-muted-foreground" />
                        </Button>
                      }
                      title="Hapus target?"
                      onConfirm={async () => {
                        const r = await deleteGoal(g.id);
                        if (r?.error) toast.error(r.error);
                        else toast.success("Target dihapus");
                      }}
                    />
                  )}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      g.is_completed ? "bg-emerald-500" : "bg-primary",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {canManage && !g.is_completed && (
                  <div className="mt-2 flex gap-2">
                    <Input
                      inputMode="numeric"
                      placeholder="Tambah dana"
                      className="h-9"
                      value={amounts[g.id] ?? ""}
                      onChange={(e) =>
                        setAmounts((prev) => ({
                          ...prev,
                          [g.id]: e.target.value.replace(/\D/g, ""),
                        }))
                      }
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!amounts[g.id]}
                      onClick={() =>
                        start(async () => {
                          const amt = Number(amounts[g.id] ?? 0);
                          const r = await contributeToGoal(g.id, amt);
                          if (r?.error) toast.error(r.error);
                          else {
                            toast.success("Dana ditambahkan");
                            setAmounts((prev) => ({ ...prev, [g.id]: "" }));
                          }
                        })
                      }
                    >
                      Tambah
                    </Button>
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
