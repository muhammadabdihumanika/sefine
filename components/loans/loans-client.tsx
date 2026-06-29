"use client";

import * as React from "react";
import { useActionState } from "react";
import { HandCoinsIcon, PlusIcon } from "lucide-react";
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
import { createLoan } from "@/app/actions/recurring";
import { formatCurrency, formatDate } from "@/lib/format";

export type LoanRow = {
  id: string;
  direction: "lent" | "borrowed";
  counterparty: string | null;
  principal: number;
  currency: string;
  interest_rate: number | null;
  term_months: number | null;
  start_date: string;
  status: string;
};

export function LoansClient({
  loans,
  activeOrgId,
  currency,
  canManage,
}: {
  loans: LoanRow[];
  activeOrgId: string;
  currency: string;
  canManage: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold">Pinjaman</h1>
        {canManage && <AddLoanSheet activeOrgId={activeOrgId} />}
      </div>

      {loans.length === 0 ? (
        <GlassCard className="flex flex-col items-center gap-2 p-10 text-center">
          <HandCoinsIcon className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">Belum ada pinjaman</p>
          <p className="text-xs text-muted-foreground">
            Catat uang yang Anda pinjamkan atau pinjam.
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {loans.map((l) => {
            const isLent = l.direction === "lent";
            return (
              <GlassCard key={l.id} variant="subtle" className="p-3">
                <div className="flex items-center gap-3">
                  <span
                    className={
                      "grid size-10 shrink-0 place-items-center rounded-full " +
                      (isLent
                        ? "bg-emerald-500/15 text-emerald-500"
                        : "bg-rose-500/15 text-rose-500")
                    }
                  >
                    <HandCoinsIcon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {l.counterparty || (isLent ? "Piutang" : "Pinjaman")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(l.start_date)}
                      {l.term_months ? ` · ${l.term_months} bln` : ""}
                      {l.interest_rate ? ` · ${l.interest_rate}%/th` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">
                      {formatCurrency(Number(l.principal), l.currency || currency)}
                    </p>
                    <Badge variant={isLent ? "default" : "secondary"} className="mt-0.5 text-[0.6rem]">
                      {isLent ? "Meminjamkan" : "Dipinjam"}
                    </Badge>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddLoanSheet({ activeOrgId }: { activeOrgId: string }) {
  const [open, setOpen] = React.useState(false);
  const [direction, setDirection] = React.useState<"lent" | "borrowed">("borrowed");
  const [accounts, setAccounts] = React.useState<{ value: string; label: string }[]>([]);
  const [accountId, setAccountId] = React.useState<string | null>(null);
  const [state, action] = useActionState(createLoan, { error: undefined });

  React.useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);
  React.useEffect(() => {
    if (state?.ok) {
      toast.success("Pinjaman dicatat");
      setOpen(false);
    }
  }, [state]);

  React.useEffect(() => {
    if (!activeOrgId) return;
    const supabase = createClient();
    void (async () => {
      const { data } = await supabase
        .from("accounts")
        .select("id,name")
        .eq("organization_id", activeOrgId)
        .eq("is_archived", false)
        .order("name");
      setAccounts((data ?? []).map((x: { id: string; name: string }) => ({ value: x.id, label: x.name })));
    })();
  }, [activeOrgId]);

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
          <SheetTitle className="text-lg">Tambah pinjaman</SheetTitle>
          <SheetDescription>Uang yang dipinjam atau dipinjamkan.</SheetDescription>
        </SheetHeader>
        <form action={action} className="space-y-3 px-5 pb-8 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Jenis</Label>
            <Picker
              value={direction}
              placeholder="Jenis"
              options={[
                { value: "borrowed", label: "Dipinjam (utang)" },
                { value: "lent", label: "Meminjamkan (piutang)" },
              ]}
              onChange={(v) => setDirection(v)}
            />
            <input type="hidden" name="direction" value={direction} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="l-party">Dari / kepada</Label>
            <Input id="l-party" name="counterparty" placeholder="opsional" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="l-principal">Pokok</Label>
            <Input id="l-principal" name="principal" required inputMode="numeric" placeholder="0" className="h-11" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="l-rate">Bunga %/th</Label>
              <Input id="l-rate" name="interest_rate" inputMode="decimal" placeholder="opsional" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-term">Tenor (bln)</Label>
              <Input id="l-term" name="term_months" inputMode="numeric" placeholder="opsional" className="h-11" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Akun (opsional)</Label>
            <Picker value={accountId} placeholder="Tanpa akun" options={accounts} onChange={setAccountId} />
            <input type="hidden" name="account_id" value={accountId ?? ""} />
          </div>
          <Button type="submit" size="lg" className="h-12 w-full">Simpan pinjaman</Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
