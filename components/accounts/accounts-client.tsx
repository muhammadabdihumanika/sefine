"use client";

import * as React from "react";
import { useActionState, useTransition } from "react";
import { CheckIcon, PlusIcon, Trash2Icon, WalletIcon } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createAccount, archiveAccount, reconcileAccount } from "@/app/actions/finance";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export type AccountRow = {
  id: string;
  name: string;
  type: string;
  currency: string;
  institution: string | null;
  current_balance: number;
  is_archived: boolean;
};

const TYPE_LABELS: Record<string, string> = {
  cash: "Tunai",
  bank: "Bank",
  ewallet: "E-Wallet",
  credit: "Kartu Kredit",
  investment: "Investasi",
};
const TYPE_OPTIONS = Object.entries(TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export function AccountsClient({
  accounts,
  canManage,
  canReconcile,
  currency,
}: {
  accounts: AccountRow[];
  canManage: boolean;
  canReconcile: boolean;
  currency: string;
}) {
  const total = accounts.reduce(
    (s, a) => s + Number(a.current_balance || 0),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold">Rekening</h1>
        {canManage && <AddAccountSheet />}
      </div>

      <GlassCard sheen className="p-5">
        <p className="text-xs text-muted-foreground">Total saldo</p>
        <p className="mt-1 font-heading text-3xl font-semibold tabular-nums">
          {formatCurrency(total, currency)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {accounts.length} rekening aktif
        </p>
      </GlassCard>

      <div className="space-y-2">
        {accounts.length === 0 ? (
          <GlassCard className="p-8 text-center">
            <p className="text-sm font-medium">Belum ada rekening</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {canManage
                ? "Tambahkan rekening pertama Anda."
                : "Minta admin menambahkan rekening."}
            </p>
          </GlassCard>
        ) : (
          accounts.map((a) => (
            <GlassCard key={a.id} variant="subtle" className="p-3">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                  <WalletIcon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {TYPE_LABELS[a.type] ?? a.type}
                    {a.institution ? ` · ${a.institution}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatCurrency(Number(a.current_balance || 0), a.currency || currency)}
                </span>
              </div>
              <div className="mt-2 flex gap-2">
                {canReconcile && (
                  <div className="flex-1">
                    <ReconcileSheet account={a} currency={a.currency || currency} />
                  </div>
                )}
                {canManage && (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label="Arsipkan rekening">
                        <Trash2Icon className="size-4 text-muted-foreground" />
                      </Button>
                    }
                    title="Arsipkan rekening?"
                    description="Rekening disembunyikan dari daftar. Transaksi yang sudah dicatat tetap ada."
                    confirmText="Arsipkan"
                    onConfirm={async () => {
                      const r = await archiveAccount(a.id);
                      if (r?.error) toast.error(r.error);
                      else toast.success("Rekening diarsipkan");
                    }}
                  />
                )}
              </div>
            </GlassCard>
          ))
        )}
      </div>
    </div>
  );
}

function AddAccountSheet() {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState("cash");
  const [state, action] = useActionState(createAccount, {
    error: undefined,
  });

  React.useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);
  React.useEffect(() => {
    if (state?.ok) {
      toast.success("Rekening ditambahkan");
      setType("cash");
      setOpen(false);
    }
  }, [state]);

  const selected = TYPE_OPTIONS.find((o) => o.value === type);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button size="sm"><PlusIcon className="size-4" />Tambah</Button>}
      />
      <SheetContent
        side="bottom"
        className="glass-strong inset-x-0 mx-auto max-w-md rounded-b-none rounded-t-3xl p-0"
      >
        <SheetHeader className="px-5 pt-5">
          <SheetTitle className="text-lg">Tambah rekening</SheetTitle>
          <SheetDescription>
            Kas, bank, e-wallet, atau kartu kredit.
          </SheetDescription>
        </SheetHeader>
        <form action={action} className="space-y-3 px-5 pb-8 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="acc-name">Nama rekening</Label>
            <Input
              id="acc-name"
              name="name"
              required
              placeholder="cth. BCA, GoPay"
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Jenis</Label>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-11 w-full justify-between font-normal"
                  />
                }
              >
                {selected?.label}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="glass-strong w-(--anchor-width)">
                {TYPE_OPTIONS.map((o) => (
                  <DropdownMenuItem key={o.value} onClick={() => setType(o.value)}>
                    {o.label}
                    {o.value === type && (
                      <CheckIcon className="ml-auto size-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <input type="hidden" name="type" value={type} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-balance">Saldo awal</Label>
            <Input
              id="acc-balance"
              name="balance"
              inputMode="numeric"
              placeholder="0"
              className="h-11"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="acc-currency">Mata uang</Label>
              <Input
                id="acc-currency"
                name="currency"
                defaultValue="IDR"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-inst">Institusi</Label>
              <Input
                id="acc-inst"
                name="institution"
                placeholder="opsional"
                className="h-11"
              />
            </div>
          </div>
          <Button type="submit" size="lg" className="h-12 w-full">
            Simpan rekening
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ReconcileSheet({
  account,
  currency,
}: {
  account: AccountRow;
  currency: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [actual, setActual] = React.useState("");
  const [pending, start] = useTransition();

  const recorded = Number(account.current_balance || 0);
  const actualNum = Number(actual.replace(/\D/g, "") || 0);
  const diff = actualNum - recorded;

  function execute() {
    start(async () => {
      const res = await reconcileAccount(account.id, actualNum);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      if (!res.diff || res.diff === 0) {
        toast.success("Sudah cocok — tidak perlu penyesuaian.");
      } else {
        const sign = res.diff > 0 ? "+" : "-";
        toast.success(
          `Disesuaikan ${sign}${formatCurrency(Math.abs(res.diff), currency)}`,
        );
      }
      setActual("");
      setOpen(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" className="mt-2 w-full">
            Rekonsiliasi
          </Button>
        }
      />
      <SheetContent
        side="bottom"
        className="glass-strong inset-x-0 mx-auto max-w-md rounded-b-none rounded-t-3xl p-0"
      >
        <SheetHeader className="px-5 pt-5">
          <SheetTitle className="text-lg">Rekonsiliasi {account.name}</SheetTitle>
          <SheetDescription>
            Samakan saldo tercatat dengan saldo sebenarnya (dari mutasi / hitung kas).
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-5 pb-8 pt-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Saldo tercatat</span>
            <span className="font-medium tabular-nums">
              {formatCurrency(recorded, currency)}
            </span>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rec-actual">Saldo sebenarnya</Label>
            <Input
              id="rec-actual"
              inputMode="numeric"
              placeholder="0"
              value={actual ? Number(actual).toLocaleString("id-ID") : ""}
              onChange={(e) => setActual(e.target.value.replace(/\D/g, ""))}
              className="h-11 text-right text-lg font-semibold"
            />
          </div>
          {actual !== "" && (
            <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                {diff >= 0 ? "Akan ditambah" : "Akan dikurangi"}
              </span>
              <span
                className={cn(
                  "font-medium tabular-nums",
                  diff >= 0 ? "text-emerald-500" : "text-rose-500",
                )}
              >
                {diff >= 0 ? "+" : "-"}
                {formatCurrency(Math.abs(diff), currency)}
              </span>
            </div>
          )}
          <Button
            type="button"
            onClick={execute}
            size="lg"
            className="h-12 w-full"
            disabled={pending || actual === ""}
          >
            Catat penyesuaian
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
