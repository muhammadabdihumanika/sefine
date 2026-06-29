"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";
import type { Role } from "@/lib/rbac/permissions";

type ActionResult = { error?: string; ok?: boolean };

export async function createOrganization(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  const currency =
    String(formData.get("currency") ?? "IDR").trim().toUpperCase() || "IDR";
  if (!name) return { error: "Nama organisasi wajib diisi." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization", {
    p_name: name,
    p_currency: currency,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidatePath("/", "layout");
  redirect("/");
}

export async function joinOrganization(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const code = String(formData.get("invite_code") ?? "").trim();
  if (!code) return { error: "Masukkan kode undangan." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("join_organization", {
    p_invite_code: code,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidatePath("/", "layout");
  redirect("/");
}

export async function setActiveOrganization(orgId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_active_organization", {
    p_org: orgId,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function regenerateInviteCode(orgId: string): Promise<
  ActionResult & { code?: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("regenerate_invite_code", {
    p_org: orgId,
  });
  if (error) return { error: friendlyError(error.message) };
  revalidatePath("/settings/members", "page");
  return { code: (data as string) ?? undefined };
}

export async function addMemberByEmail(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const orgId = String(formData.get("org_id") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const role = (String(formData.get("role") ?? "member") as Role) || "member";
  if (!email || !orgId) return { error: "Email diperlukan." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_member_by_email", {
    p_org: orgId,
    p_email: email,
    p_role: role,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidatePath("/settings/members", "page");
  return {};
}

export async function updateMemberRole(
  memberId: string,
  role: Role,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_member_role", {
    p_member: memberId,
    p_role: role,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidatePath("/settings/members", "page");
  return {};
}

export async function removeMember(memberId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", { p_member: memberId });
  if (error) return { error: friendlyError(error.message) };

  revalidatePath("/settings/members", "page");
  return {};
}

export async function leaveOrganization(orgId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_organization", { p_org: orgId });
  if (error) return { error: friendlyError(error.message) };

  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * Permanently delete an organization (owner only). Cascades to every org-scoped
 * table. The RPC refuses if the caller owns no other org. Does NOT redirect so
 * the management list can refresh in place with a toast.
 */
export async function deleteOrganization(orgId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_organization", {
    p_org: orgId,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Strip the Postgres context prefix to surface a clean message. */
function friendlyError(message: string): string {
  return message.replace(/^ERROR:\s*/i, "").trim();
}
