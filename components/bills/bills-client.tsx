"use client";

import * as React from "react";
import { useActionState, useTransition } from "react";
import { CalendarClockIcon, CheckIcon, PlusIcon } from "lucide-react";
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
  SheetTrigger,
} from "@/components/ui/sheet";
import { Picker } from "@/components/ui/picker";
import { createClient } from "@/utils/supabase/client";
import { createBill, payBill } from "@/app/actions/recurring";
import { formatCurrency, formatRelativeDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export type BillRow = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  frequency: string;
  next_due_date: string;
  end_date: string | null;
  is_paid: boolean;
  account: { id: string; name: string } | null;
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
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, 1));
}

type Group = { key: string; label: string; items: BillRow[] };

function groupByMonth(active: BillRow[]): Group[] {
  const map = new Map<string, BillRow[]>();
  for (const b of active) {
    const key = (b.next_due_date || "").slice(0, 7); // YYYY-MM
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(b);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, items]) => ({
      key,
      label: formatMonthYear(key),
      items: items
        .slice()
        .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date)),
    }));
}

function dueStatus(next: string, isPaid: boolean) {
  if (isPaid) return { label: "Lunas", tone: "muted" as const };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(next + "T00:00:00");
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return { label: "Terlambat", tone: "rose" as const };
  if (diff === 0) return { label: "Hari ini", tone: "amber" as const };
  if (diff <= 7) return { label: `${diff} hari lagi`, tone: "amber" as const };
  return { label: formatRelativeDay(next), tone: "muted" as const };
}

export function BillsClient({
  bills,
  activeOrgId,
  currency,
  canManage,
  canPay,
}: {
  bills: BillRow[];
  activeOrgId: string;
  currency: string;
  canManage: boolean;
  canPay: boolean;
}) {
  const [, start] = useTransition();

  const active = bills.filter((b) => !b.is_paid);
  const done = bills.filter((b) => b.is_paid);
  const groups = groupByMonth(active);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold">Tagihan</h1>
        {canManage && <AddBillSheet activeOrgId={activeOrgId} />}
      </div>

      {bills.length === 0 ? (
        <GlassCard className="flex flex-col items-center gap-2 p-10 text-center">
          <CalendarClockIcon className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">Belum ada tagihan</p>
          <p className="text-xs text-muted-foreground">
            {canManage
              ? "Catat tagihan berulang agar tidak lupa jatuh tempo."
              : "Minta admin menambahkan tagihan."}
          </p>
        </GlassCard>
      ) : (
        <>
          {groups.map((g) => (
            <div key={g.key} className="space-y-2">
              <div className="flex items-baseline justify-between px-1">
                <span className="text-sm font-semibold">{g.label}</span>
                <span className="text-xs text-muted-foreground">
                  {g.items.length} tagihan
                </span>
              </div>
              <div className="space-y-2">
                {g.items.map((b) => (
                  <BillCard
                    key={b.id}
                    bill={b}
                    currency={currency}
                    canPay={canPay}
                    onPay={() =>
                      start(async () => {
                        const r = await payBill(b.id);
                        if (r?.error) toast.error(r.error);
                        else toast.success("Tagihan dibayar & dicatat");
                      })
                    }
                  />
                ))}
              </div>
            </div>
          ))}

          {done.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="px-1 text-xs font-medium text-muted-foreground">
                Selesai ({done.length})
              </div>
              <div className="space-y-2 opacity-70">
                {done.map((b) => (
                  <BillCard
                    key={b.id}
                    bill={b}
                    currency={currency}
                    canPay={false}
                    onPay={() => {}}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BillCard({
  bill,
  currency,
  canPay,
  onPay,
}: {
  bill: BillRow;
  currency: string;
  canPay: boolean;
  onPay: () => void;
}) {
  const status = dueStatus(bill.next_due_date, bill.is_paid);
  const d = new Date(bill.next_due_date + "T00:00:00");
  const day = d.getDate();
  const monthShort = new Intl.DateTimeFormat("id-ID", { month: "short" }).format(
    d,
  );

  return (
    <GlassCard variant="subtle" className="p-3">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "grid w-11 shrink-0 place-items-center rounded-lg border py-1 text-center",
            bill.is_paid
              ? "border-border bg-muted/40 text-muted-foreground"
              : status.tone === "rose"
                ? "border-rose-500/30 bg-rose-500/10 text-rose-500"
                : status.tone === "amber"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "border-border bg-muted/40 text-foreground",
          )}
        >
          <span className="text-base leading-none font-bold">{day}</span>
          <span className="text-[0.6rem] uppercase tracking-wide">{monthShort}</span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{bill.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {bill.account?.name ?? "Tanpa akun"} · {FREQ[bill.frequency] ?? bill.frequency}
            {bill.end_date
              ? ` · s/d ${formatMonthYear(bill.end_date.slice(0, 7))}`
              : ""}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums">
            {formatCurrency(Number(bill.amount), bill.currency || currency)}
          </p>
          {!bill.is_paid && (
            <Badge
              variant="secondary"
              className={cn(
                "mt-0.5 text-[0.6rem]",
                status.tone === "rose" && "bg-rose-500/15 text-rose-500",
                status.tone === "amber" &&
                  "bg-amber-500/15 text-amber-600 dark:text-amber-400",
              )}
            >
              {status.label}
            </Badge>
          )}
        </div>
      </div>

      {canPay && !bill.is_paid && (
        <Button variant="outline" size="sm" className="mt-2 w-full" onClick={onPay}>
          <CheckIcon className="size-4" />
          Tandai lunas
        </Button>
      )}
    </GlassCard>
  );
}

function AddBillSheet({ activeOrgId }: { activeOrgId: string }) {
  const [open, setOpen] = React.useState(false);
  const [accountId, setAccountId] = React.useState<string | null>(null);
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [frequency, setFrequency] = React.useState("monthly");
  const [accounts, setAccounts] = React.useState<{ value: string; label: string }[]>([]);
  const [catOptions, setCatOptions] = React.useState<
    { value: string; label: string }[]
  >([]);
  const [state, action] = useActionState(createBill, { error: undefined });

  React.useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);
  React.useEffect(() => {
    if (state?.ok) {
      toast.success("Tagihan ditambahkan");
      setOpen(false);
    }
  }, [state]);

  React.useEffect(() => {
    if (!activeOrgId) return;
    const supabase = createClient();
    void (async () => {
      const [a, c] = await Promise.all([
        supabase
          .from("accounts")
          .select("id,name")
          .eq("organization_id", activeOrgId)
          .eq("is_archived", false)
          .order("name"),
        supabase
          .from("categories")
          .select("id,name")
          .eq("organization_id", activeOrgId)
          .eq("type", "expense")
          .order("name"),
      ]);
      setAccounts((a.data ?? []).map((x: { id: string; name: string }) => ({ value: x.id, label: x.name })));
      setCatOptions((c.data ?? []).map((x: { id: string; name: string }) => ({ value: x.id, label: x.name })));
      setAccountId((a.data ?? [])[0]?.id ?? null);
    })();
  }, [activeOrgId]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button size="sm"><PlusIcon className="size-4" />Tambah</Button>}
      />
      <SheetContent
        side="bottom"
        className="glass-strong inset-x-0 mx-auto max-h-[92dvh] max-w-md overflow-y-auto rounded-b-none rounded-t-3xl p-0"
      >
        <SheetHeader className="px-5 pt-5">
          <SheetTitle className="text-lg">Tambah tagihan</SheetTitle>
          <SheetDescription>
            Tagihan berulang akan otomatis maju jatuh temponya setelah dibayar.
          </SheetDescription>
        </SheetHeader>
        <form action={action} className="space-y-3 px-5 pb-8 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="bill-name">Nama</Label>
            <Input id="bill-name" name="name" required placeholder="cth. Listrik PLN" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bill-amount">Nominal</Label>
            <Input id="bill-amount" name="amount" required inputMode="numeric" placeholder="0" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Bayar dari akun</Label>
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
              <Label htmlFor="bill-date">Jatuh tempo</Label>
              <Input id="bill-date" name="start_date" type="date" defaultValue={today} className="h-11" />
            </div>
            {frequency !== "once" && (
              <div className="space-y-1.5">
                <Label htmlFor="bill-end">Sampai (opsional)</Label>
                <Input id="bill-end" name="end_date" type="date" className="h-11" />
              </div>
            )}
          </div>
          {frequency !== "once" && (
            <p className="text-[0.7rem] text-muted-foreground">
              Kosongkan “Sampai” agar tagihan berulang tanpa batas.
            </p>
          )}
          <Button type="submit" size="lg" className="h-12 w-full">Simpan tagihan</Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
