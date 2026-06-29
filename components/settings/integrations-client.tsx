"use client";

import * as React from "react";
import { useActionState, useTransition } from "react";
import {
  BotIcon,
  CheckCircle2Icon,
  MessageCircleIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/glass/glass-card";
import { Picker } from "@/components/ui/picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createClient } from "@/utils/supabase/client";
import { requestWaVerification, verifyWa } from "@/app/actions/integrations";
import {
  addPlatformModel,
  deletePlatformModel,
  setPlatformAiConfig,
} from "@/app/actions/platform";
import { cn } from "@/lib/utils";

// OpenAI-compatible providers (9router etc.) — just OpenAI provider + custom base URL.
export const ROUTER_9_URL = "http://app.everta.cloud:20128/v1";

export type PlatformAi = {
  provider: "anthropic" | "openai";
  model: string | null;
  temperature: number;
  max_tokens: number;
  has_key: boolean;
  base_url: string | null;
};
export type PlatformModel = {
  id: string;
  provider: "anthropic" | "openai";
  model_id: string;
  label: string;
};
export type WaLink = {
  phone_number: string;
  phone_number_display: string | null;
  status: "pending" | "verified" | "disabled";
};

export function IntegrationsClient({
  ai,
  models,
  isSuperAdmin,
  wa,
  webhookUrl,
}: {
  ai: PlatformAi | null;
  models: PlatformModel[];
  isSuperAdmin: boolean;
  wa: WaLink | null;
  webhookUrl: string;
}) {
  return (
    <div className="space-y-4">
      <h1 className="font-heading text-xl font-semibold">Integrasi</h1>
      <WhatsappSection wa={wa} webhookUrl={webhookUrl} />
      <AiSection ai={ai} models={models} isSuperAdmin={isSuperAdmin} />
    </div>
  );
}

function WhatsappSection({
  wa,
  webhookUrl,
}: {
  wa: WaLink | null;
  webhookUrl: string;
}) {
  const [, start] = useTransition();
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [devCode, setDevCode] = React.useState<string | null>(null);
  const verified = wa?.status === "verified";

  async function sendCode() {
    if (!phone.trim()) return toast.error("Masukkan nomor WhatsApp.");
    const res = await requestWaVerification(phone);
    if (res?.error) return toast.error(res.error);
    if (res.code) {
      setDevCode(res.code);
      toast.info(`Kode verifikasi (dev): ${res.code}`);
    } else toast.success("Kode dikirim via WhatsApp.");
  }
  async function doVerify() {
    const res = await verifyWa(phone, code);
    if (res?.error) return toast.error(res.error);
    if (res.verified) {
      toast.success("WhatsApp terhubung!");
      setDevCode(null);
    } else toast.error("Kode salah atau kedaluwarsa.");
  }

  return (
    <GlassCard className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <MessageCircleIcon className="size-5 text-emerald-500" />
        <p className="text-sm font-medium">Asisten WhatsApp</p>
        {verified && (
          <Badge className="ml-auto bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[0.6rem]">
            <CheckCircle2Icon className="size-3" /> Terhubung
          </Badge>
        )}
      </div>
      {verified ? (
        <p className="text-sm text-muted-foreground">
          Nomor{" "}
          <span className="font-medium text-foreground">
            {wa?.phone_number_display ?? wa?.phone_number}
          </span>{" "}
          terhubung. Kirim pesan ke nomor WhatsApp Bisnis untuk mencatat transaksi lewat AI.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Hubungkan nomor WhatsApp Anda agar bisa chat dengan asisten AI.
          </p>
          <div className="flex gap-2">
            <Input
              inputMode="tel"
              placeholder="cth. 0812xxxx / +62..."
              className="h-11"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Button
              variant="outline"
              size="lg"
              onClick={() => start(async () => { await sendCode(); })}
            >
              Kirim kode
            </Button>
          </div>
          {devCode && (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Kode (dev):{" "}
              <span className="font-mono font-medium text-foreground">{devCode}</span>
            </p>
          )}
          <div className="flex gap-2">
            <Input
              inputMode="numeric"
              placeholder="Kode 6 digit"
              className="h-11"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <Button size="lg" onClick={() => start(async () => { await doVerify(); })}>
              Verifikasi
            </Button>
          </div>
        </div>
      )}
      <div className="mt-3 rounded-lg bg-muted/60 p-2.5 text-[0.7rem] text-muted-foreground">
        <p className="font-medium text-foreground">Setup WhatsApp Bisnis:</p>
        <p>Webhook:</p>
        <code className="block break-all rounded bg-background/60 px-2 py-1 font-mono">
          {webhookUrl}
        </code>
        <p>Set secret Edge Function: WA_VERIFY_TOKEN, WA_APP_SECRET, WA_ACCESS_TOKEN, WA_PHONE_NUMBER_ID.</p>
      </div>
    </GlassCard>
  );
}

function AiSection({
  ai,
  models,
  isSuperAdmin,
}: {
  ai: PlatformAi | null;
  models: PlatformModel[];
  isSuperAdmin: boolean;
}) {
  const [provider, setProvider] = React.useState<"anthropic" | "openai">(
    ai?.provider ?? "anthropic",
  );
  const [baseUrl, setBaseUrl] = React.useState(ai?.base_url ?? "");
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<
    { ok: boolean; msg: string } | null
  >(null);
  const [state, action] = useActionState(setPlatformAiConfig, { error: undefined });

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("ai-test");
      if (error) throw error;
      if (data?.ok) {
        setTestResult({
          ok: true,
          msg: `${data.provider} · ${data.model} — “${data.reply}”`,
        });
      } else {
        setTestResult({ ok: false, msg: String(data?.error ?? "Gagal") });
      }
    } catch (e) {
      setTestResult({
        ok: false,
        msg: e instanceof Error ? e.message : "Gagal menghubungi fungsi",
      });
    } finally {
      setTesting(false);
    }
  }
  const [modelState, modelAction] = useActionState(addPlatformModel, {
    error: undefined,
  });

  React.useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);
  React.useEffect(() => {
    if (state?.ok) toast.success("Konfigurasi AI disimpan");
  }, [state]);
  React.useEffect(() => {
    if (modelState?.error) toast.error(modelState.error);
  }, [modelState]);
  React.useEffect(() => {
    if (modelState?.ok) toast.success("Model ditambahkan");
  }, [modelState]);

  return (
    <GlassCard className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <BotIcon className="size-5 text-primary" />
        <p className="text-sm font-medium">Provider AI (platform)</p>
        {ai?.has_key && (
          <Badge variant="secondary" className="ml-auto text-[0.6rem]">
            <ShieldCheckIcon className="size-3" /> {ai.provider} ·{" "}
            {ai.model ?? "model bawaan"}
          </Badge>
        )}
      </div>

      {!isSuperAdmin ? (
        <p className="text-xs text-muted-foreground">
          AI dikonfigurasi oleh admin platform. Pengguna cukup memakai asisten
          WhatsApp & chat AI.
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            Kunci API disimpan terenkripsi, dipakai semua organisasi (WA + chat),
            dan tidak pernah dikirim ke browser.
          </p>
          <form action={action} className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Provider</Label>
              <Picker
                value={provider}
                placeholder="Provider"
                options={[
                  { value: "anthropic", label: "Anthropic (Claude)" },
                  { value: "openai", label: "OpenAI / kompatibel (9router dll.)" },
                ]}
                onChange={(v) => setProvider(v)}
              />
              <input type="hidden" name="provider" value={provider} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-key">
                API Key{" "}
                {ai?.has_key && (
                  <span className="text-xs font-normal text-muted-foreground">
                    (kosongkan jika tidak diubah)
                  </span>
                )}
              </Label>
              <Input
                id="ai-key"
                name="api_key"
                type="password"
                placeholder={ai?.has_key ? "•••••••• (biarkan kosong untuk mempertahankan)" : "sk-... / sb-..."}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-model">Model (opsional)</Label>
              <Input
                id="ai-model"
                name="model"
                placeholder={provider === "anthropic" ? "claude-sonnet-4-5" : "gpt-4o-mini"}
                defaultValue={ai?.model ?? ""}
                className="h-11"
              />
            </div>
            {provider === "openai" && (
              <div className="space-y-1.5">
                <Label htmlFor="ai-base" className="text-xs text-muted-foreground">
                  Base URL (opsional — untuk 9router & OpenAI-compatible lain)
                </Label>
                <Input
                  id="ai-base"
                  name="base_url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="kosongkan untuk OpenAI resmi"
                  className="h-11"
                />
                <button
                  type="button"
                  onClick={() => setBaseUrl(ROUTER_9_URL)}
                  className="text-xs text-primary hover:underline"
                >
                  Isi otomatis: 9router ({ROUTER_9_URL})
                </button>
              </div>
            )}
            <Button type="submit" size="lg" className="h-11 w-full">
              Simpan konfigurasi
            </Button>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={testConnection}
              disabled={testing}
            >
              {testing ? "Menguji…" : "Tes koneksi"}
            </Button>
            {testResult && (
              <span
                className={cn(
                  "text-xs",
                  testResult.ok
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-500",
                )}
              >
                {testResult.ok ? "✓ " : "✗ "}
                {testResult.msg}
              </span>
            )}
            {!testResult && (
              <span className="text-[0.7rem] text-muted-foreground">
                Tes memakai konfigurasi yang sudah disimpan.
              </span>
            )}
          </div>

          <div className="mt-4 border-t border-border/50 pt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Model tersedia ({models.length})
            </p>
            <div className="space-y-1.5">
              {models.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm"
                >
                  <span className="flex-1 truncate">
                    {m.label}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({m.provider})
                    </span>
                  </span>
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label="Hapus model">
                        <Trash2Icon className="size-4 text-muted-foreground" />
                      </Button>
                    }
                    title="Hapus model?"
                    onConfirm={async () => {
                      const r = await deletePlatformModel(m.id);
                      if (r?.error) toast.error(r.error);
                      else toast.success("Model dihapus");
                    }}
                  />
                </div>
              ))}
            </div>
            <form action={modelAction} className="mt-2 flex gap-2">
              <input type="hidden" name="provider" value={provider} />
              <Input name="model_id" required placeholder="model-id" className="h-10" />
              <Input name="label" placeholder="label" className="h-10" />
              <Button type="submit" size="lg">
                Tambah
              </Button>
            </form>
          </div>
        </>
      )}
    </GlassCard>
  );
}
