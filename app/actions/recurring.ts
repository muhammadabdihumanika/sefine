"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import { requireActiveOrg } from "@/lib/session";

type Result = { error?: string; ok?: boolean };

function friendly(message: string): string {
  return message.replace(/^ERROR:\s*/i, "").trim();
}

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------
export async function createBill(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  await requireActiveOrg();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const amount = Number(
    String(formData.get("amount") ?? "").replace(/\D/g, "") || 0,
  );
  const accountId = String(formData.get("account_id") ?? "");
  const categoryId = formData.get("category_id")
    ? String(formData.get("category_id"))
    : null;
  const frequency = String(formData.get("frequency") ?? "monthly");
  const startDate = String(formData.get("start_date") ?? "").trim() || null;
  const endDate = String(formData.get("end_date") ?? "").trim() || null;

  if (!name) return { error: "Nama tagihan wajib diisi." };
  if (!amount) return { error: "Nominal wajib diisi." };

  const { error } = await supabase.rpc("create_bill", {
    p_name: name,
    p_amount: amount,
    p_account_id: accountId || null,
    p_category_id: categoryId,
    p_frequency: frequency,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) return { error: friendly(error.message) };

  revalidatePath("/bills", "page");
  revalidatePath("/", "page");
  return { ok: true };
}

export async function payBill(id: string): Promise<Result> {
  await requireActiveOrg();
  const supabase = await createClient();
  const { error } = await supabase.rpc("pay_bill", { p_bill: id });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/bills", "page");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Loans
// ---------------------------------------------------------------------------
export async function createLoan(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const ctx = await requireActiveOrg();
  const supabase = await createClient();
  const direction = String(formData.get("direction") ?? "borrowed");
  const counterparty =
    String(formData.get("counterparty") ?? "").trim() || null;
  const principal = Number(
    String(formData.get("principal") ?? "").replace(/\D/g, "") || 0,
  );
  const interestRate = formData.get("interest_rate")
    ? Number(formData.get("interest_rate"))
    : null;
  const termMonths = formData.get("term_months")
    ? Number(formData.get("term_months"))
    : null;
  const accountId = formData.get("account_id")
    ? String(formData.get("account_id"))
    : null;

  if (!principal) return { error: "Pokok pinjaman wajib diisi." };

  const { error } = await supabase.from("loans").insert({
    organization_id: ctx.activeOrgId,
    direction,
    counterparty,
    principal,
    interest_rate: interestRate,
    term_months: termMonths,
    account_id: accountId,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/settings/loans", "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Installments
// ---------------------------------------------------------------------------
export async function createInstallment(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const ctx = await requireActiveOrg();
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const counterparty =
    String(formData.get("counterparty") ?? "").trim() || null;
  const principal = Number(
    String(formData.get("principal") ?? "").replace(/\D/g, "") || 0,
  );
  const termMonths = Number(formData.get("term_months") ?? 0);
  const installmentAmount = Number(
    String(formData.get("installment_amount") ?? "").replace(/\D/g, "") || 0,
  );
  const accountId = formData.get("account_id")
    ? String(formData.get("account_id"))
    : null;

  if (!name || !principal || !termMonths || !installmentAmount)
    return { error: "Lengkapi data cicilan." };

  const { error } = await supabase.from("installments").insert({
    organization_id: ctx.activeOrgId,
    name,
    counterparty,
    principal,
    term_months: termMonths,
    installment_amount: installmentAmount,
    account_id: accountId,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/settings/installments", "page");
  return { ok: true };
}

export async function payInstallment(id: string): Promise<Result> {
  await requireActiveOrg();
  const supabase = await createClient();
  const { error } = await supabase.rpc("pay_installment", { p_installment: id });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/settings/installments", "page");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------
export async function createBudget(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const ctx = await requireActiveOrg();
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim() || null;
  const categoryId = formData.get("category_id")
    ? String(formData.get("category_id"))
    : null;
  const period = String(formData.get("period") ?? "monthly");
  const amount = Number(
    String(formData.get("amount") ?? "").replace(/\D/g, "") || 0,
  );

  if (!amount) return { error: "Nominal anggaran wajib diisi." };

  const { error } = await supabase.from("budgets").insert({
    organization_id: ctx.activeOrgId,
    name,
    category_id: categoryId,
    period,
    amount,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/settings/budgets", "page");
  return { ok: true };
}

export async function deleteBudget(id: string): Promise<Result> {
  await requireActiveOrg();
  const supabase = await createClient();
  const { error } = await supabase.from("budgets").delete().eq("id", id);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/settings/budgets", "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Savings goals
// ---------------------------------------------------------------------------
export async function createGoal(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const ctx = await requireActiveOrg();
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const targetAmount = Number(
    String(formData.get("target_amount") ?? "").replace(/\D/g, "") || 0,
  );
  const targetDate =
    String(formData.get("target_date") ?? "").trim() || null;

  if (!name || !targetAmount)
    return { error: "Nama dan target wajib diisi." };

  const { error } = await supabase.from("savings_goals").insert({
    organization_id: ctx.activeOrgId,
    name,
    target_amount: targetAmount,
    target_date: targetDate,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/settings/goals", "page");
  return { ok: true };
}

export async function contributeToGoal(
  id: string,
  amount: number,
): Promise<Result> {
  await requireActiveOrg();
  const supabase = await createClient();
  const { error } = await supabase.rpc("contribute_to_goal", {
    p_goal: id,
    p_amount: amount,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/settings/goals", "page");
  return { ok: true };
}

export async function deleteGoal(id: string): Promise<Result> {
  await requireActiveOrg();
  const supabase = await createClient();
  const { error } = await supabase.from("savings_goals").delete().eq("id", id);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/settings/goals", "page");
  revalidatePath("/keuangan", "page");
  return { ok: true };
}

export async function setLoanStatus(
  id: string,
  status: "active" | "paid" | "written_off",
): Promise<Result> {
  await requireActiveOrg();
  const supabase = await createClient();
  const { error } = await supabase.from("loans").update({ status }).eq("id", id);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/keuangan", "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Recurring income (pendapatan berulang)
// ---------------------------------------------------------------------------
export async function createRecurringIncome(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  await requireActiveOrg();
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const amount = Number(
    String(formData.get("amount") ?? "").replace(/\D/g, "") || 0,
  );
  const accountId = String(formData.get("account_id") ?? "");
  const categoryId = formData.get("category_id")
    ? String(formData.get("category_id"))
    : null;
  const frequency = String(formData.get("frequency") ?? "monthly");
  const startDate = String(formData.get("start_date") ?? "").trim() || null;
  const endDate = String(formData.get("end_date") ?? "").trim() || null;

  if (!name) return { error: "Nama wajib diisi." };
  if (!amount) return { error: "Nominal wajib diisi." };
  const { error } = await supabase.rpc("create_recurring_income", {
    p_name: name,
    p_amount: amount,
    p_account_id: accountId || null,
    p_category_id: categoryId,
    p_frequency: frequency,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/keuangan", "page");
  return { ok: true };
}

export async function receiveRecurringIncome(id: string): Promise<Result> {
  await requireActiveOrg();
  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_recurring_income", { p_id: id });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/", "layout");
  revalidatePath("/keuangan", "page");
  return { ok: true };
}

export async function skipRecurringIncome(id: string): Promise<Result> {
  await requireActiveOrg();
  const supabase = await createClient();
  const { error } = await supabase.rpc("skip_recurring_income", { p_id: id });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/keuangan", "page");
  return { ok: true };
}

export async function deleteRecurringIncome(id: string): Promise<Result> {
  await requireActiveOrg();
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_recurring_income", { p_id: id });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/keuangan", "page");
  return { ok: true };
}
