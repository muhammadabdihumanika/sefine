"use client";

import * as React from "react";
import { useActionState, useTransition } from "react";
import {
  CheckIcon,
  PlusIcon,
  Trash2Icon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/glass/glass-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/utils/supabase/client";
import {
  createCategory,
  deleteCategory,
  updateCategoryDefault,
} from "@/app/actions/finance";
import { cn } from "@/lib/utils";

export type CatRow = {
  id: string;
  name: string;
  type: "income" | "expense" | "transfer";
  is_system: boolean;
  default_account_id: string | null;
};

export function CategoriesClient({
  categories,
  canManage,
  activeOrgId,
}: {
  categories: CatRow[];
  canManage: boolean;
  activeOrgId: string;
}) {
  const [type, setType] = React.useState<"expense" | "income">("expense");
  const [state, action] = useActionState(createCategory, {
    error: undefined,
  });
  const [, start] = useTransition();
  const [accounts, setAccounts] = React.useState<
    { id: string; name: string }[]
  >([]);

  React.useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);
  React.useEffect(() => {
    if (state?.ok) toast.success("Kategori ditambahkan");
  }, [state]);

  React.useEffect(() => {
    if (!activeOrgId || !canManage) return;
    const supabase = createClient();
    void (async () => {
      const { data } = await supabase
        .from("accounts")
        .select("id,name")
        .eq("organization_id", activeOrgId)
        .eq("is_archived", false)
        .order("name");
      setAccounts((data ?? []) as { id: string; name: string }[]);
    })();
  }, [activeOrgId, canManage]);

  const income = categories.filter((c) => c.type === "income");
  const expense = categories.filter((c) => c.type === "expense");

  const onDelete = async (id: string) => {
    const r = await deleteCategory(id);
    if (r?.error) toast.error(r.error);
    else toast.success("Kategori dihapus");
  };
  const onDefault = (id: string, acc: string | null) =>
    start(async () => {
      const r = await updateCategoryDefault(id, acc);
      if (r?.error) toast.error(r.error);
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold">Kategori</h1>
        {canManage && (
          <div className="text-[0.7rem] text-muted-foreground">
            Akun default dipakai otomatis saat mencatat
          </div>
        )}
      </div>

      {canManage && (
        <GlassCard className="p-4">
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1">
            {(["expense", "income"] as const).map((t) => (
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
                {t === "expense" ? "Pengeluaran" : "Pemasukan"}
              </button>
            ))}
          </div>
          <form action={action} className="flex gap-2">
            <input type="hidden" name="type" value={type} />
            <Input
              name="name"
              required
              placeholder="Nama kategori"
              className="h-11"
            />
            <Button type="submit" size="lg">
              <PlusIcon className="size-4" />
              Tambah
            </Button>
          </form>
        </GlassCard>
      )}

      <Section
        title="Pengeluaran"
        icon={TrendingDownIcon}
        items={expense}
        canManage={canManage}
        accounts={accounts}
        onDefault={onDefault}
        onDelete={onDelete}
      />
      <Section
        title="Pemasukan"
        icon={TrendingUpIcon}
        items={income}
        canManage={canManage}
        accounts={accounts}
        onDefault={onDefault}
        onDelete={onDelete}
      />
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  items,
  canManage,
  accounts,
  onDefault,
  onDelete,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: CatRow[];
  canManage: boolean;
  accounts: { id: string; name: string }[];
  onDefault: (id: string, acc: string | null) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {title}
        </span>
      </div>
      <GlassCard className="p-0">
        {items.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            Belum ada kategori.
          </p>
        ) : (
          items.map((c, i) => (
            <div
              key={c.id}
              className={cn(
                "flex items-center gap-2 p-3",
                i < items.length - 1 && "border-b border-border/50",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {c.name}
                  {c.is_system && (
                    <span className="ml-2 text-[0.6rem] text-muted-foreground">
                      bawaan
                    </span>
                  )}
                </p>
                {canManage && (
                  <div className="mt-1">
                    <DefaultAccountPicker
                      value={c.default_account_id}
                      accounts={accounts}
                      onChange={(acc) => onDefault(c.id, acc)}
                    />
                  </div>
                )}
              </div>
              {canManage && (
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label="Hapus kategori">
                      <Trash2Icon className="size-4 text-muted-foreground" />
                    </Button>
                  }
                  title="Hapus kategori?"
                  description="Kategori akan dihapus. Transaksi yang sudah ada tetap tercatat."
                  onConfirm={() => onDelete(c.id)}
                />
              )}
            </div>
          ))
        )}
      </GlassCard>
    </div>
  );
}

function DefaultAccountPicker({
  value,
  accounts,
  onChange,
}: {
  value: string | null;
  accounts: { id: string; name: string }[];
  onChange: (id: string | null) => void;
}) {
  const selected = accounts.find((a) => a.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="xs" className="h-7 max-w-[12rem] gap-1 px-2 text-muted-foreground" />
        }
      >
        {selected ? (
          <span className="truncate text-foreground">{selected.name}</span>
        ) : (
          "Akun default"
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="glass-strong max-h-64 max-w-[14rem] overflow-y-auto"
      >
        <DropdownMenuItem onClick={() => onChange(null)}>
          Tanpa default
        </DropdownMenuItem>
        {accounts.map((a) => (
          <DropdownMenuItem key={a.id} onClick={() => onChange(a.id)}>
            <span className="truncate">{a.name}</span>
            {a.id === value && (
              <CheckIcon className="ml-auto size-4 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
