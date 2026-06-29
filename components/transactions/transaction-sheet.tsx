"use client";

import * as React from "react";
import { useTransition } from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AmountInput } from "@/components/transactions/amount-input";
import { DatePicker } from "@/components/ui/date-picker";
import { createClient } from "@/utils/supabase/client";
import { createTransaction } from "@/app/actions/finance";
import { cn } from "@/lib/utils";

type TxType = "expense" | "income" | "transfer";

type AccountOption = { id: string; name: string };
type CategoryOption = {
  id: string;
  name: string;
  type: "income" | "expense" | "transfer";
  default_account_id: string | null;
};

export function TransactionSheetBody({
  preset = "expense",
  activeOrgId,
  onDone,
}: {
  preset?: TxType;
  activeOrgId: string;
  onDone: () => void;
}) {
  // preset is applied via the `key` remount in QuickAddProvider (no effect needed).
  const [type, setType] = React.useState<TxType>(preset);

  const [amount, setAmount] = React.useState<number | null>(null);
  const [accountId, setAccountId] = React.useState<string | null>(null);
  const [toAccountId, setToAccountId] = React.useState<string | null>(null);
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [description, setDescription] = React.useState("");
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [date, setDate] = React.useState(today);

  const [accounts, setAccounts] = React.useState<AccountOption[]>([]);
  const [categories, setCategories] = React.useState<CategoryOption[]>([]);
  const [pending, startTransition] = useTransition();

  React.useEffect(() => {
    if (!activeOrgId) return;
    const supabase = createClient();
    let cancelled = false;
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
          .select("id,name,type,default_account_id")
          .eq("organization_id", activeOrgId)
          .order("type")
          .order("name"),
      ]);
      if (cancelled) return;
      const accs = (a.data ?? []) as AccountOption[];
      const cats = (c.data ?? []) as CategoryOption[];
      setAccounts(accs);
      setCategories(cats);
      setAccountId((prev) => prev ?? accs[0]?.id ?? null);
      setToAccountId((prev) => prev ?? accs[1]?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  const cats = categories.filter((c) => c.type === type);

  // When a category is chosen, auto-select its configured default account.
  function pickCategory(id: string) {
    setCategoryId(id);
    const cat = categories.find((c) => c.id === id);
    if (
      cat?.default_account_id &&
      accounts.some((a) => a.id === cat.default_account_id)
    ) {
      setAccountId(cat.default_account_id);
    }
  }

  function reset() {
    setAmount(null);
    setCategoryId(null);
    setDescription("");
    setDate(today);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || amount <= 0) return toast.error("Masukkan jumlah.");
    if (!accountId) return toast.error("Pilih akun.");
    if (type === "transfer" && !toAccountId)
      return toast.error("Pilih akun tujuan.");

    const fd = new FormData();
    fd.set("type", type);
    fd.set("amount", String(amount));
    fd.set("account_id", accountId);
    if (type === "transfer" && toAccountId) fd.set("to_account_id", toAccountId);
    if (type !== "transfer" && categoryId) fd.set("category_id", categoryId);
    if (description.trim()) fd.set("description", description.trim());
    fd.set("date", date);

    startTransition(async () => {
      const res = await createTransaction({ error: undefined }, fd);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success(
        type === "income"
          ? "Pemasukan tercatat"
          : type === "transfer"
            ? "Transfer tercatat"
            : "Pengeluaran tercatat",
      );
      reset();
      onDone();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1">
        {(["expense", "income", "transfer"] as TxType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={cn(
              "rounded-lg py-2 text-sm font-medium transition",
              type === t
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {t === "expense" ? "Keluar" : t === "income" ? "Masuk" : "Pindah"}
          </button>
        ))}
      </div>

      <AmountInput value={amount} onValueChange={setAmount} autoFocus />

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          {type === "transfer" ? "Dari akun" : "Akun"}
        </Label>
        <Picker
          value={accountId}
          placeholder="Pilih akun"
          options={accounts}
          onChange={setAccountId}
        />
      </div>

      {type === "transfer" ? (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Ke akun</Label>
          <Picker
            value={toAccountId}
            placeholder="Pilih akun tujuan"
            options={accounts.filter((a) => a.id !== accountId)}
            onChange={setToAccountId}
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Kategori</Label>
          <Picker
            value={categoryId}
            placeholder="Tanpa kategori"
            options={cats}
            onChange={pickCategory}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Catatan (opsional)</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="cth. Makan siang bersama tim"
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
        className="h-12 w-full text-base"
        disabled={pending}
      >
        {pending && <Loader2Icon className="size-4 animate-spin" />}
        Simpan transaksi
      </Button>
    </form>
  );
}

function Picker({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string | null;
  placeholder: string;
  options: AccountOption[];
  onChange: (id: string) => void;
}) {
  const selected = options.find((o) => o.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="lg" className="h-11 w-full justify-between font-normal" />
        }
      >
        {selected ? (
          selected.name
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="glass-strong max-h-72 w-(--anchor-width) overflow-y-auto"
      >
        {options.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-muted-foreground">
            Belum ada data.
          </div>
        ) : (
          options.map((o) => (
            <DropdownMenuItem key={o.id} onClick={() => onChange(o.id)}>
              {o.name}
              {o.id === value && (
                <CheckIcon className="ml-auto size-4 text-primary" />
              )}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
