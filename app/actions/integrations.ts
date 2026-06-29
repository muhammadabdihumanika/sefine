"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import { requireUser } from "@/lib/session";

type Result = { error?: string; ok?: boolean; code?: string; verified?: boolean };

function friendly(message: string): string {
  return message.replace(/^ERROR:\s*/i, "").trim();
}

export async function setAiProviderConfig(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  await requireUser();
  const supabase = await createClient();

  const provider = String(formData.get("provider") ?? "anthropic");
  const apiKey = String(formData.get("api_key") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim() || null;
  const temperature = Number(formData.get("temperature") ?? 0.3) || 0.3;
  const maxTokens = Number(formData.get("max_tokens") ?? 2048) || 2048;

  if (!apiKey) return { error: "API key wajib diisi." };

  const { error } = await supabase.rpc("set_ai_provider_config", {
    p_provider: provider,
    p_api_key: apiKey,
    p_model: model,
    p_temperature: temperature,
    p_max_tokens: maxTokens,
  });
  if (error) return { error: friendly(error.message) };

  revalidatePath("/settings/integrations", "page");
  return { ok: true };
}

// Dev convenience: returns the OTP code so the UI can display it.
// In production the code is delivered via WhatsApp by the Edge Function.
export async function requestWaVerification(phone: string): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_wa_verification", {
    p_phone: phone,
  });
  if (error) return { error: friendly(error.message) };
  return { code: (data as string) ?? undefined };
}

export async function verifyWa(phone: string, code: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_wa", {
    p_phone: phone,
    p_code: code,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/settings/integrations", "page");
  return { verified: Boolean(data), ok: Boolean(data) };
}
