import type { AiProvider, ProviderConfig } from "./provider.ts";
import { DEFAULT_MODELS } from "./provider.ts";
import { anthropicProvider } from "./providers/anthropic.ts";
import { openaiProvider } from "./providers/openai.ts";

export function getProvider(name: string): AiProvider {
  return name === "openai" ? openaiProvider : anthropicProvider;
}

export type ActiveConfig = {
  providerName: "anthropic" | "openai";
  config: ProviderConfig;
  systemPromptExtra: string | null;
};

/** Reads + decrypts the platform-wide AI config (service role only). */
export async function getPlatformConfig(
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<ActiveConfig | null> {
  const { data: cfg } = await supabase
    .from("platform_ai_config")
    .select("provider,model,temperature,max_tokens,system_prompt_extra,api_key_encrypted,base_url")
    .eq("id", 1)
    .maybeSingle();
  if (!cfg || !cfg.api_key_encrypted) return null;

  const { data: key } = await supabase.rpc("decrypt_platform_ai_key");
  if (!key) return null;

  return {
    providerName: cfg.provider as "anthropic" | "openai",
    config: {
      apiKey: String(key),
      model: cfg.model || DEFAULT_MODELS[cfg.provider] || DEFAULT_MODELS.anthropic,
      temperature: Number(cfg.temperature ?? 0.3),
      maxTokens: Number(cfg.max_tokens ?? 2048),
      baseURL: cfg.base_url ?? undefined,
    },
    systemPromptExtra: cfg.system_prompt_extra ?? null,
  };
}

/** Reads + decrypts the org's active provider config (service role only). */
export async function getActiveConfig(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  orgId: string,
): Promise<ActiveConfig | null> {
  const { data: cfg } = await supabase
    .from("ai_provider_configs")
    .select("provider,model,temperature,max_tokens,system_prompt_extra")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .maybeSingle();

  if (!cfg) return null;

  const { data: key } = await supabase.rpc("decrypt_ai_provider_key", {
    p_org: orgId,
  });
  if (!key) return null;

  return {
    providerName: cfg.provider as "anthropic" | "openai",
    config: {
      apiKey: String(key),
      model: cfg.model || DEFAULT_MODELS[cfg.provider] || DEFAULT_MODELS.anthropic,
      temperature: Number(cfg.temperature ?? 0.3),
      maxTokens: Number(cfg.max_tokens ?? 2048),
    },
    systemPromptExtra: cfg.system_prompt_extra ?? null,
  };
}
