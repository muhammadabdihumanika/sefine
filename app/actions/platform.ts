"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import { requireUser } from "@/lib/session";

type Result = { error?: string; ok?: boolean };

function friendly(message: string): string {
  return message.replace(/^ERROR:\s*/i, "").trim();
}

export async function setPlatformAiConfig(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const ctx = await requireUser();
  if (!ctx.isSuperAdmin) return { error: "Hanya super admin." };
  const supabase = await createClient();

  const provider = String(formData.get("provider") ?? "anthropic");
  const apiKey = String(formData.get("api_key") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim() || null;
  const temperature = Number(formData.get("temperature") ?? 0.3) || 0.3;
  const maxTokens = Number(formData.get("max_tokens") ?? 2048) || 2048;
  const baseUrl = String(formData.get("base_url") ?? "").trim() || null;

  // api_key may be blank when editing other fields — the RPC keeps the existing key.
  const { error } = await supabase.rpc("set_platform_ai_config", {
    p_provider: provider,
    p_api_key: apiKey || null,
    p_model: model,
    p_temperature: temperature,
    p_max_tokens: maxTokens,
    p_base_url: baseUrl,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/settings/integrations", "page");
  return { ok: true };
}

export async function addPlatformModel(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const ctx = await requireUser();
  if (!ctx.isSuperAdmin) return { error: "Hanya super admin." };
  const supabase = await createClient();

  const provider = String(formData.get("provider") ?? "anthropic");
  const modelId = String(formData.get("model_id") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim() || modelId;
  if (!modelId) return { error: "Model ID wajib." };
  const { error } = await supabase.rpc("upsert_platform_model", {
    p_provider: provider,
    p_model_id: modelId,
    p_label: label,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/settings/integrations", "page");
  return { ok: true };
}

export async function deletePlatformModel(id: string): Promise<Result> {
  const ctx = await requireUser();
  if (!ctx.isSuperAdmin) return { error: "Hanya super admin." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_platform_model", { p_model: id });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/settings/integrations", "page");
  return { ok: true };
}
