import {
  IntegrationsClient,
  type PlatformAi,
  type PlatformModel,
  type WaLink,
} from "@/components/settings/integrations-client";
import { requireActiveOrg } from "@/lib/session";
import { createClient } from "@/utils/supabase/server";
import { env } from "@/lib/env";

export default async function IntegrationsPage() {
  const ctx = await requireActiveOrg();

  const supabase = await createClient();
  const [aiRes, modelsRes, waRes] = await Promise.all([
    supabase.rpc("get_platform_ai_config_safe"),
    supabase
      .from("platform_models")
      .select("id,provider,model_id,label")
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("whatsapp_links")
      .select("phone_number,phone_number_display,status")
      .eq("user_id", ctx.userId)
      .maybeSingle(),
  ]);

  const ai = (aiRes.data?.[0] ?? null) as PlatformAi | null;
  const models = (modelsRes.data ?? []) as PlatformModel[];
  const wa = (waRes.data ?? null) as WaLink | null;
  const webhookUrl = `${env.supabaseUrl}/functions/v1/whatsapp-webhook`;

  return (
    <IntegrationsClient
      ai={ai}
      models={models}
      isSuperAdmin={ctx.isSuperAdmin}
      wa={wa}
      webhookUrl={webhookUrl}
    />
  );
}
