"use client";

import * as React from "react";
import {
  ArrowDownLeftIcon,
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/glass/glass-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EditTransactionSheet } from "@/components/transactions/edit-transaction-sheet";
import { deleteTransaction } from "@/app/actions/finance";
import { formatCurrency, formatRelativeDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TxRow = {
  id: string;
  type: "income" | "expense" | "transfer_debit";
  amount: number;
  description: string | null;
  transaction_date: string;
  created_at: string;
  organization_id: string;
  account: { id: string; name: string } | null;
  category: { id: string; name: string; type: string } | null;
};

function signed(t: TxRow): number {
  if (t.type === "income") return Number(t.amount);
  if (t.type === "expense") return -Number(t.amount);
  return 0;
}

export function TransactionList({
  transactions,
  canDelete,
}: {
  transactions: TxRow[];
  canDelete: boolean;
}) {
  const [editing, setEditing] = React.useState<TxRow | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);

  function openEdit(t: TxRow) {
    setEditing(t);
    setEditOpen(true);
  }

  const groups = React.useMemo(() => {
    const map = new Map<string, TxRow[]>();
    for (const t of transactions) {
      const arr = map.get(t.transaction_date) ?? [];
      arr.push(t);
      map.set(t.transaction_date, arr);
    }
    return Array.from(map.entries());
  }, [transactions]);

  if (transactions.length === 0) {
    return (
      <GlassCard className="flex flex-col items-center gap-2 p-10 text-center">
        <p className="text-sm font-medium">Belum ada transaksi</p>
        <p className="text-xs text-muted-foreground">
          Ketuk tombol + untuk mencatat transaksi pertama Anda.
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(([date, items]) => {
        const net = items.reduce((s, t) => s + signed(t), 0);
        return (
          <div key={date} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-medium text-muted-foreground">
                {formatRelativeDay(date)}
              </span>
              <span
                className={cn(
                  "text-xs font-medium tabular-nums",
                  net > 0
                    ? "text-emerald-500"
                    : net < 0
                      ? "text-rose-500"
                      : "text-muted-foreground",
                )}
              >
                {formatCurrency(net)}
              </span>
            </div>
            <GlassCard className="p-0">
              {items.map((t, i) => (
                <Row
                  key={t.id}
                  t={t}
                  canDelete={canDelete}
                  last={i === items.length - 1}
                  onEdit={() => openEdit(t)}
                />
              ))}
            </GlassCard>
          </div>
        );
      })}

      <EditTransactionSheet
        tx={editing}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}

function Row({
  t,
  canDelete,
  last,
  onEdit,
}: {
  t: TxRow;
  canDelete: boolean;
  last: boolean;
  onEdit: () => void;
}) {
  const isIncome = t.type === "income";
  const isExpense = t.type === "expense";
  const Icon = isIncome
    ? ArrowDownLeftIcon
    : isExpense
      ? ArrowUpRightIcon
      : ArrowLeftRightIcon;
  const title =
    t.description ||
    t.category?.name ||
    (isIncome ? "Pemasukan" : isExpense ? "Pengeluaran" : "Transfer");

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3",
        !last && "border-b border-border/50",
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full",
          isIncome
            ? "bg-emerald-500/15 text-emerald-500"
            : isExpense
              ? "bg-rose-500/15 text-rose-500"
              : "bg-primary/15 text-primary",
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {t.account?.name}
          {t.category ? ` · ${t.category.name}` : ""}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 text-sm font-semibold tabular-nums",
          isIncome
            ? "text-emerald-500"
            : isExpense
              ? "text-rose-500"
              : "text-foreground",
        )}
      >
        {isIncome ? "+" : isExpense ? "-" : ""}
        {formatCurrency(Number(t.amount))}
      </span>
      {canDelete && (
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Edit transaksi"
            onClick={onEdit}
          >
            <PencilIcon className="size-4 text-muted-foreground" />
          </Button>
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Hapus transaksi"
              >
                <Trash2Icon className="size-4 text-muted-foreground" />
              </Button>
            }
            title="Hapus transaksi?"
            description="Tindakan ini tidak bisa dibatalkan."
            onConfirm={async () => {
              const r = await deleteTransaction(t.id);
              if (r?.error) toast.error(r.error);
              else toast.success("Transaksi dihapus");
            }}
          />
        </div>
      )}
    </div>
  );
}
