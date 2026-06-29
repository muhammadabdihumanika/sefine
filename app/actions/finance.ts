"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import { requireActiveOrg } from "@/lib/session";

type Result = { error?: string; ok?: boolean };

function friendly(message: string): string {
  return message.replace(/^ERROR:\s*/i, "").trim();
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------
export async function createTransaction(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  await requireActiveOrg();
  const supabase = await createClient();

  const type = String(formData.get("type") ?? "expense");
  const amount = Number(
    String(formData.get("amount") ?? "").replace(/\D/g, "") || 0,
  );
  const accountId = String(formData.get("account_id") ?? "");
  const toAccountId = formData.get("to_account_id")
    ? String(formData.get("to_account_id"))
    : null;
  const categoryId = formData.get("category_id")
    ? String(formData.get("category_id"))
    : null;
  const description =
    String(formData.get("description") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "").trim() || null;

  if (!amount || amount <= 0) return { error: "Masukkan jumlah yang valid." };
  if (!accountId) return { error: "Pilih akun." };

  const { error } = await supabase.rpc("create_transaction", {
    p_type: type,
    p_amount: amount,
    p_account_id: accountId,
    p_to_account_id: toAccountId,
    p_category_id: categoryId,
    p_description: description,
    p_date: dateStr,
    p_source: "manual",
  });
  if (error) return { error: friendly(error.message) };

  revalidatePath("/", "page");
  revalidatePath("/transactions", "page");
  return {};
}

export async function deleteTransaction(id: string): Promise<Result> {
  await requireActiveOrg();
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_transaction", { p_id: id });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/", "page");
  revalidatePath("/transactions", "page");
  return {};
}

export async function updateTransaction(args: {
  id: string;
  amount: number;
  categoryId: string | null;
  description: string | null;
  date: string;
}): Promise<Result> {
  await requireActiveOrg();
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_transaction", {
    p_id: args.id,
    p_amount: args.amount,
    p_category_id: args.categoryId,
    p_description: args.description,
    p_date: args.date,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/", "page");
  revalidatePath("/transactions", "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
export async function createAccount(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const ctx = await requireActiveOrg();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "cash");
  const balance = Number(
    String(formData.get("balance") ?? "").replace(/\D/g, "") || 0,
  );
  const currency =
    String(formData.get("currency") ?? "IDR").trim().toUpperCase() || "IDR";
  const institution =
    String(formData.get("institution") ?? "").trim() || null;

  if (!name) return { error: "Nama rekening wajib diisi." };

  const { error } = await supabase.from("accounts").insert({
    organization_id: ctx.activeOrgId,
    name,
    type,
    balance,
    currency,
    institution,
  });
  if (error) return { error: friendly(error.message) };

  revalidatePath("/", "page");
  revalidatePath("/settings/accounts", "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export async function createCategory(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const ctx = await requireActiveOrg();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "expense");

  if (!name) return { error: "Nama kategori wajib diisi." };

  const { error } = await supabase.from("categories").insert({
    organization_id: ctx.activeOrgId,
    name,
    type,
  });
  if (error) return { error: friendly(error.message) };

  revalidatePath("/", "page");
  revalidatePath("/settings/categories", "page");
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<Result> {
  await requireActiveOrg();
  const supabase = await createClient();
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/settings/categories", "page");
  return { ok: true };
}

/** Set the default account used when a transaction picks this category. */
export async function updateCategoryDefault(
  categoryId: string,
  accountId: string | null,
): Promise<Result> {
  await requireActiveOrg();
  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ default_account_id: accountId })
    .eq("id", categoryId);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/settings/categories", "page");
  return { ok: true };
}

/** Reconcile an account: record an adjustment so the balance matches reality. */
export async function reconcileAccount(
  accountId: string,
  actual: number,
): Promise<Result & { recorded?: number; diff?: number }> {
  await requireActiveOrg();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reconcile_account", {
    p_account: accountId,
    p_actual: actual,
  });
  if (error) return { error: friendly(error.message) };
  const row = (
    data as
      | {
          recorded: number;
          actual: number;
          diff: number;
          transaction_id: string | null;
        }[]
      | null
  )?.[0];
  revalidatePath("/", "page");
  revalidatePath("/settings/accounts", "page");
  return { ok: true, recorded: row?.recorded, diff: row?.diff };
}

/** Archive an account (soft delete — transactions remain). */
export async function archiveAccount(id: string): Promise<Result> {
  await requireActiveOrg();
  const supabase = await createClient();
  const { error } = await supabase
    .from("accounts")
    .update({ is_archived: true })
    .eq("id", id);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/settings/accounts", "page");
  revalidatePath("/", "page");
  return { ok: true };
}
