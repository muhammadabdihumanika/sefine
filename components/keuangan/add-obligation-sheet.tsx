"use client";

import * as React from "react";
import { useTransition } from "react";
import {
  CalendarClockIcon,
  CreditCardIcon,
  HandCoinsIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Picker } from "@/components/ui/picker";
import { createClient } from "@/utils/supabase/client";
import {
  createBill,
  createInstallment,
  createLoan,
} from "@/app/actions/recurring";
import { cn } from "@/lib/utils";

type Kind = "bill" | "installment" | "loan";

const KINDS: { value: Kind; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "bill", label: "Tagihan", icon: CalendarClockIcon },
  { value: "installment", label: "Cicilan", icon: CreditCardIcon },
  { value: "loan", label: "Pinjaman", icon: HandCoinsIcon },
];

export function AddObligationSheet({
  open,
  onOpenChange,
  activeOrgId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeOrgId: string;
}) {
  const [kind, setKind] = React.useState<Kind>("bill");
  const [pending, start] = useTransition();

  const [accounts, setAccounts] = React.useState<{ value: string; label: string }[]>([]);
  const [catOptions, setCatOptions] = React.useState<{ value: string; label: string }[]>([]);
  const [accountId, setAccountId] = React.useState<string | null>(null);
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [frequency, setFrequency] = React.useState("monthly");
  const [direction, setDirection] = React.useState<"borrowed" | "lent">("borrowed");
  const today = new Date().toISOString().slice(0, 10);

  React.useEffect(() => {
    if (!open) return;
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
      setAccountId((prev) => prev ?? (a.data ?? [])[0]?.id ?? null);
    })();
  }, [open, activeOrgId]);

  function run(fd: FormData, action: (prev: { error?: string }, fd: FormData) => Promise<{ error?: string }>, successMsg: string) {
    start(async () => {
      const res = await action({ error: undefined }, fd);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success(successMsg);
      onOpenChange(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="glass-strong inset-x-0 mx-auto max-h-[92dvh] max-w-md overflow-y-auto rounded-b-none rounded-t-3xl p-0"
      >
        <SheetHeader className="px-5 pt-5">
          <SheetTitle className="text-lg">Tambah tagihan</SheetTitle>
          <SheetDescription>
            Pilih jenis dulu, lalu isi detail. Tagihan = biaya rutin; Cicilan =
            angsuran tetap; Pinjaman = utang/piutang sekaligus.
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-3 gap-2 px-5 py-3">
          {KINDS.map((k) => {
            const Icon = k.icon;
            return (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border p-2.5 text-xs font-medium transition",
                  kind === k.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
                {k.label}
              </button>
            );
          })}
        </div>

        <div className="px-5 pb-8">
          {kind === "bill" && (
            <BillForm
              accounts={accounts}
              catOptions={catOptions}
              accountId={accountId}
              setAccountId={setAccountId}
              categoryId={categoryId}
              setCategoryId={setCategoryId}
              frequency={frequency}
              setFrequency={setFrequency}
              today={today}
              pending={pending}
              onRun={(fd) => run(fd, createBill, "Tagihan ditambahkan")}
            />
          )}
          {kind === "installment" && (
            <InstallmentForm
              accounts={accounts}
              accountId={accountId}
              setAccountId={setAccountId}
              pending={pending}
              onRun={(fd) => run(fd, createInstallment, "Cicilan ditambahkan")}
            />
          )}
          {kind === "loan" && (
            <LoanForm
              accounts={accounts}
              accountId={accountId}
              setAccountId={setAccountId}
              direction={direction}
              setDirection={setDirection}
              pending={pending}
              onRun={(fd) => run(fd, createLoan, "Pinjaman ditambahkan")}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function BillForm(props: {
  accounts: { value: string; label: string }[];
  catOptions: { value: string; label: string }[];
  accountId: string | null;
  setAccountId: (v: string | null) => void;
  categoryId: string | null;
  setCategoryId: (v: string | null) => void;
  frequency: string;
  setFrequency: (v: string) => void;
  today: string;
  pending: boolean;
  onRun: (fd: FormData) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onRun(new FormData(e.currentTarget));
      }}
      className="space-y-3"
    >
      <Field label="Nama"><Input name="name" required placeholder="cth. Listrik PLN" className="h-11" /></Field>
      <Field label="Nominal"><Input name="amount" required inputMode="numeric" placeholder="0" className="h-11" /></Field>
      <Field label="Bayar dari akun">
        <Picker value={props.accountId} placeholder="Pilih akun" options={props.accounts} onChange={props.setAccountId} />
        <input type="hidden" name="account_id" value={props.accountId ?? ""} />
      </Field>
      <Field label="Kategori (opsional)">
        <Picker value={props.categoryId} placeholder="Tanpa kategori" options={props.catOptions} onChange={props.setCategoryId} />
        <input type="hidden" name="category_id" value={props.categoryId ?? ""} />
      </Field>
      <Field label="Frekuensi">
        <Picker
          value={props.frequency}
          placeholder="Frekuensi"
          options={[
            { value: "monthly", label: "Bulanan" },
            { value: "weekly", label: "Mingguan" },
            { value: "yearly", label: "Tahunan" },
            { value: "once", label: "Sekali" },
          ]}
          onChange={props.setFrequency}
        />
        <input type="hidden" name="frequency" value={props.frequency} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Jatuh tempo"><Input name="start_date" type="date" defaultValue={props.today} className="h-11" /></Field>
        {props.frequency !== "once" && (
          <Field label="Sampai (opsional)"><Input name="end_date" type="date" className="h-11" /></Field>
        )}
      </div>
      {props.frequency !== "once" && (
        <p className="-mt-1 text-[0.7rem] text-muted-foreground">
          Kosongkan tanggal akhir agar tagihan berulang tanpa batas (setiap{" "}
          {props.frequency === "weekly"
            ? "minggu"
            : props.frequency === "yearly"
              ? "tahun"
              : "bulan"}
          ).
        </p>
      )}
      <Button type="submit" size="lg" className="h-12 w-full" disabled={props.pending}>Simpan tagihan</Button>
    </form>
  );
}

function InstallmentForm(props: {
  accounts: { value: string; label: string }[];
  accountId: string | null;
  setAccountId: (v: string | null) => void;
  pending: boolean;
  onRun: (fd: FormData) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onRun(new FormData(e.currentTarget));
      }}
      className="space-y-3"
    >
      <Field label="Nama"><Input name="name" required placeholder="cth. Cicilan HP" className="h-11" /></Field>
      <Field label="Kepada (opsional)"><Input name="counterparty" className="h-11" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pokok"><Input name="principal" required inputMode="numeric" placeholder="0" className="h-11" /></Field>
        <Field label="Tenor (bln)"><Input name="term_months" required inputMode="numeric" placeholder="12" className="h-11" /></Field>
      </div>
      <Field label="Cicilan /bln"><Input name="installment_amount" required inputMode="numeric" placeholder="0" className="h-11" /></Field>
      <Field label="Bayar dari akun">
        <Picker value={props.accountId} placeholder="Pilih akun" options={props.accounts} onChange={props.setAccountId} />
        <input type="hidden" name="account_id" value={props.accountId ?? ""} />
      </Field>
      <Button type="submit" size="lg" className="h-12 w-full" disabled={props.pending}>Simpan cicilan</Button>
    </form>
  );
}

function LoanForm(props: {
  accounts: { value: string; label: string }[];
  accountId: string | null;
  setAccountId: (v: string | null) => void;
  direction: "borrowed" | "lent";
  setDirection: (v: "borrowed" | "lent") => void;
  pending: boolean;
  onRun: (fd: FormData) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onRun(new FormData(e.currentTarget));
      }}
      className="space-y-3"
    >
      <Field label="Jenis">
        <Picker
          value={props.direction}
          placeholder="Jenis"
          options={[
            { value: "borrowed", label: "Dipinjam (utang)" },
            { value: "lent", label: "Meminjamkan (piutang)" },
          ]}
          onChange={(v) => props.setDirection(v as "borrowed" | "lent")}
        />
        <input type="hidden" name="direction" value={props.direction} />
      </Field>
      <Field label="Dari / kepada (opsional)"><Input name="counterparty" className="h-11" /></Field>
      <Field label="Pokok"><Input name="principal" required inputMode="numeric" placeholder="0" className="h-11" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bunga %/th (opsional)"><Input name="interest_rate" inputMode="decimal" className="h-11" /></Field>
        <Field label="Tenor (bln, opsional)"><Input name="term_months" inputMode="numeric" className="h-11" /></Field>
      </div>
      <Field label="Akun (opsional)">
        <Picker value={props.accountId} placeholder="Tanpa akun" options={props.accounts} onChange={props.setAccountId} />
        <input type="hidden" name="account_id" value={props.accountId ?? ""} />
      </Field>
      <Button type="submit" size="lg" className="h-12 w-full" disabled={props.pending}>Simpan pinjaman</Button>
    </form>
  );
}
