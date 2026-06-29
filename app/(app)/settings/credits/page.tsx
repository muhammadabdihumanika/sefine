import { redirect } from "next/navigation";

import { GlassCard } from "@/components/glass/glass-card";
import { requireUser } from "@/lib/session";
import { createClient } from "@/utils/supabase/server";

type UsageRow = {
  user_id: string;
  email: string | null;
  total_credits: number;
  total_input: number;
  total_output: number;
  calls: number;
};

export default async function CreditsPage() {
  const ctx = await requireUser();
  if (!ctx.isSuperAdmin) redirect("/settings");

  const supabase = await createClient();
  const { data } = await supabase.rpc("ai_usage_summary");
  const rows = (data ?? []) as UsageRow[];

  const totalCredits = rows.reduce((s, r) => s + Number(r.total_credits), 0);
  const totalCalls = rows.reduce((s, r) => s + Number(r.calls), 0);

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-xl font-semibold">Penggunaan kredit AI</h1>

      <GlassCard sheen className="p-4">
        <p className="text-xs text-muted-foreground">Total kredit (1 credit ≈ 1000 token)</p>
        <p className="mt-1 font-heading text-3xl font-semibold tabular-nums">
          {totalCredits.toFixed(1)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {totalCalls} panggilan · {rows.length} pengguna
        </p>
      </GlassCard>

      <GlassCard className="p-4">
        <p className="mb-3 text-sm font-medium">Per pengguna</p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada penggunaan AI.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div
                key={r.user_id}
                className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.email ?? r.user_id}</p>
                  <p className="text-xs text-muted-foreground">
                    {Number(r.calls)} panggilan · in {Number(r.total_input).toLocaleString("id-ID")} / out{" "}
                    {Number(r.total_output).toLocaleString("id-ID")} token
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">
                  {Number(r.total_credits).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
