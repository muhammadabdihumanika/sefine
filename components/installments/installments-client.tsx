"use client";

import * as React from "react";
import { useActionState, useTransition } from "react";
import { CheckIcon, CreditCardIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
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
import { createInstallment, payInstallment } from "@/app/actions/recurring";
import { formatCurrency, formatRelativeDay } from "@/lib/format";

export type InstallmentRow = {
  id: string;
  name: string;
  counterparty: string | null;
  installment_amount: number;
  principal: number;
  currency: string;
  term_months: number;
  paid_count: number;
  next_due_date: string;
  status: string;
};

export function InstallmentsClient({
  installments,
  activeOrgId,
  currency,
  canManage,
  canPay,
}: {
  installments: InstallmentRow[];
  activeOrgId: string;
  currency: string;
  canManage: boolean;
  canPay: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold">Cicilan</h1>
        {canManage && <AddInstallmentSheet activeOrgId={activeOrgId} />}
      </div>

      {installments.length === 0 ? (
        <GlassCard className="flex flex-col items-center gap-2 p-10 text-center">
          <CreditCardIcon className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">Belum ada cicilan</p>
          <p className="text-xs text-muted-foreground">
            Catat cicilan & lacak pembayarannya tiap bulan.
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {installments.map((i) => {
            const done = i.status === "paid";
            return (
              <GlassCard key={i.id} variant="subtle" className="p-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                    <CreditCardIcon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{i.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(Number(i.installment_amount), i.currency || currency)}{" "}
                      /bln · {i.paid_count}/{i.term_months} cicil
                      {!done && ` · ${formatRelativeDay(i.next_due_date)}`}
                    </p>
                  </div>
                  <Badge variant={done ? "secondary" : "default"} className="text-[0.6rem]">
                    {done ? "Lunas" : "Aktif"}
                  </Badge>
                </div>
                {canPay && !done && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await payInstallment(i.id);
                        if (r?.error) toast.error(r.error);
                        else toast.success("Cicilan dibayar & dicatat");
                      })
                    }
                  >
                    <CheckIcon className="size-4" />
                    Bayar cicilan ini
                  </Button>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddInstallmentSheet({ activeOrgId }: { activeOrgId: string }) {
  const [open, setOpen] = React.useState(false);
  const [accounts, setAccounts] = React.useState<{ value: string; label: string }[]>([]);
  const [accountId, setAccountId] = React.useState<string | null>(null);
  const [state, action] = useActionState(createInstallment, { error: undefined });

  React.useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);
  React.useEffect(() => {
    if (state?.ok) {
      toast.success("Cicilan dicatat");
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
          <SheetTitle className="text-lg">Tambah cicilan</SheetTitle>
          <SheetDescription>
            Cicilan dengan nominal tetap tiap periode.
          </SheetDescription>
        </SheetHeader>
        <form action={action} className="space-y-3 px-5 pb-8 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="i-name">Nama</Label>
            <Input id="i-name" name="name" required placeholder="cth. HP, Motor" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="i-party">Kepada (opsional)</Label>
            <Input id="i-party" name="counterparty" className="h-11" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="i-principal">Pokok</Label>
              <Input id="i-principal" name="principal" required inputMode="numeric" placeholder="0" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-term">Tenor (bln)</Label>
              <Input id="i-term" name="term_months" required inputMode="numeric" placeholder="12" className="h-11" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="i-emi">Cicilan /bln</Label>
            <Input id="i-emi" name="installment_amount" required inputMode="numeric" placeholder="0" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Akun (opsional)</Label>
            <Picker value={accountId} placeholder="Tanpa akun" options={accounts} onChange={setAccountId} />
            <input type="hidden" name="account_id" value={accountId ?? ""} />
          </div>
          <SubmitButton size="lg" className="h-12 w-full">Simpan cicilan</SubmitButton>
        </form>
      </SheetContent>
    </Sheet>
  );
}
