"use client";

import * as React from "react";
import { useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AmountInput } from "@/components/transactions/amount-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Picker } from "@/components/ui/picker";
import { createClient } from "@/utils/supabase/client";
import { updateTransaction } from "@/app/actions/finance";
import type { TxRow } from "@/components/transactions/transaction-list";

export function EditTransactionSheet({
  tx,
  open,
  onOpenChange,
}: {
  tx: TxRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [amount, setAmount] = React.useState<number | null>(null);
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [description, setDescription] = React.useState("");
  const [date, setDate] = React.useState("");
  const [cats, setCats] = React.useState<{ value: string; label: string }[]>([]);
  const [pending, start] = useTransition();

  const isTransfer = tx?.type === "transfer_debit";

  React.useEffect(() => {
    if (tx) {
      setAmount(Number(tx.amount));
      setCategoryId(tx.category?.id ?? null);
      setDescription(tx.description ?? "");
      setDate(tx.transaction_date);
    }
  }, [tx]);

  React.useEffect(() => {
    if (!open || !tx || isTransfer) return;
    const supabase = createClient();
    const t = tx.type === "income" ? "income" : "expense";
    void (async () => {
      const { data } = await supabase
        .from("categories")
        .select("id,name")
        .eq("organization_id", tx.organization_id)
        .eq("type", t)
        .order("name");
      setCats(
        (data ?? []).map((c: { id: string; name: string }) => ({
          value: c.id,
          label: c.name,
        })),
      );
    })();
  }, [open, tx, isTransfer]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tx) return;
    if (!amount || amount <= 0) return toast.error("Masukkan jumlah yang valid.");
    start(async () => {
      const res = await updateTransaction({
        id: tx.id,
        amount,
        categoryId: isTransfer ? null : categoryId,
        description: description.trim() || null,
        date,
      });
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Transaksi diperbarui");
      onOpenChange(false);
    });
  }

  if (!tx) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="glass-strong inset-x-0 mx-auto max-w-md rounded-b-none rounded-t-3xl p-0"
      >
        <SheetHeader className="px-5 pt-5">
          <SheetTitle className="text-lg">Edit transaksi</SheetTitle>
          <SheetDescription>
            {isTransfer
              ? "Transfer antar rekening"
              : tx.type === "income"
                ? "Pemasukan"
                : "Pengeluaran"}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="space-y-4 px-5 pb-8 pt-2">
          <AmountInput value={amount} onValueChange={setAmount} />

          {!isTransfer && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Kategori</Label>
              <Picker
                value={categoryId}
                placeholder="Tanpa kategori"
                options={cats}
                onChange={setCategoryId}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Catatan</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="opsional"
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Tanggal</Label>
            <DatePicker value={date} onChange={(v) => setDate(v ?? "")} />
          </div>

          <Button
            type="submit"
            size="lg"
            className="h-12 w-full"
            disabled={pending}
          >
            {pending && <Loader2Icon className="size-4 animate-spin" />}
            Simpan perubahan
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
