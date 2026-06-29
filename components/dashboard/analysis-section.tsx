import {
  AlertTriangleIcon,
  CalendarRangeIcon,
  PiggyBankIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";

import { GlassCard } from "@/components/glass/glass-card";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Analysis, MonthPoint } from "@/lib/analysis";

/**
 * Rolling 6-month analysis shown at the bottom of the Beranda dashboard:
 * 3 past months of actuals + 3 future months of projections, with a
 * surplus / "perlu tambahan" callout for the upcoming quarter.
 *
 * Server component — all figures are computed upstream in computeAnalysis().
 */
export function AnalysisSection({
  analysis,
  currency,
}: {
  analysis: Analysis;
  currency: string;
}) {
  const deficit = analysis.futureSurplus < 0;
  const gap = Math.abs(analysis.futureSurplus);
  const perMonth = Math.round(gap / 3);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <CalendarRangeIcon className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Analisis 6 bulan</h2>
        <span className="ml-auto text-[0.7rem] text-muted-foreground">
          3 lalu · 3 depan
        </span>
      </div>

      {/* ---- PAST: actuals ---- */}
      <GlassCard className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">3 bulan terakhir</p>
            <p className="text-[0.7rem] text-muted-foreground">
              Aktual dari transaksi tercatat
            </p>
          </div>
          <Badge tone="muted">Aktual</Badge>
        </div>

        <div className="space-y-2">
          {analysis.past.map((p) => (
            <MonthRow key={p.key} p={p} currency={currency} />
          ))}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/50 pt-3">
          <Stat
            label="Pemasukan"
            value={formatCompactCurrency(
              analysis.past.reduce((s, p) => s + p.income, 0),
              currency,
            )}
            tone="income"
          />
          <Stat
            label="Pengeluaran"
            value={formatCompactCurrency(
              analysis.past.reduce((s, p) => s + p.expense, 0),
              currency,
            )}
            tone="expense"
          />
          <Stat
            label="Tagihan"
            value={formatCompactCurrency(
              analysis.past.reduce((s, p) => s + p.bills, 0),
              currency,
            )}
            tone="amber"
          />
        </div>
      </GlassCard>

      {/* ---- FUTURE: projection ---- */}
      <GlassCard className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">3 bulan ke depan</p>
            <p className="text-[0.7rem] text-muted-foreground">
              Proyeksi dari tagihan, cicilan &amp; pendapatan berulang
            </p>
          </div>
          <Badge tone="muted">Proyeksi</Badge>
        </div>

        {/* Surplus / deficit callout */}
        <div
          className={cn(
            "mb-3 flex items-center gap-3 rounded-xl p-3",
            deficit
              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          )}
        >
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-full",
              deficit
                ? "bg-rose-500/15 text-rose-500"
                : "bg-emerald-500/15 text-emerald-500",
            )}
          >
            {deficit ? (
              <AlertTriangleIcon className="size-5" />
            ) : (
              <PiggyBankIcon className="size-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.7rem] font-medium uppercase tracking-wide opacity-80">
              {deficit ? "Perlu tambahan" : "Proyeksi surplus"}
            </p>
            <p className="font-heading text-xl font-semibold tabular-nums">
              {formatCurrency(gap, currency)}
            </p>
            <p className="text-[0.7rem] opacity-80">
              {deficit
                ? `≈ ${formatCompactCurrency(perMonth, currency)}/bln agar semua kewajiban tertutup`
                : "Sisa setelah semua kewajiban — bisa ditabung/diinvestasikan"}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {analysis.future.map((p) => (
            <MonthRow key={p.key} p={p} currency={currency} />
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/50 pt-3">
          <Stat
            label="Pemasukan proyeksi"
            value={formatCompactCurrency(analysis.futureIncome, currency)}
            tone="income"
          />
          <Stat
            label="Kebutuhan proyeksi"
            value={formatCompactCurrency(analysis.futureNeed, currency)}
            tone="expense"
          />
        </div>
      </GlassCard>
    </section>
  );
}

// ---- small building blocks ----
function MonthRow({ p, currency }: { p: MonthPoint; currency: string }) {
  const max = Math.max(p.income, p.expense, 1);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="w-8 text-muted-foreground">{p.label}</span>
        <span className="flex items-center gap-2 tabular-nums">
          <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
            <TrendingUpIcon className="size-3" />
            {formatCompactCurrency(p.income, currency)}
          </span>
          <span className="inline-flex items-center gap-0.5 text-rose-500">
            <TrendingDownIcon className="size-3" />
            {formatCompactCurrency(p.expense, currency)}
          </span>
        </span>
      </div>
      <div className="flex h-1.5 gap-1 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full bg-emerald-500/70"
          style={{ width: `${(p.income / max) * 100}%` }}
        />
        <div
          className="h-full rounded-full bg-rose-500/70"
          style={{ width: `${(p.expense / max) * 100}%` }}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "income" | "expense" | "amber";
}) {
  return (
    <div className="text-center">
      <p className="text-[0.65rem] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums",
          tone === "income" && "text-emerald-600 dark:text-emerald-400",
          tone === "expense" && "text-rose-500",
          tone === "amber" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Badge({ tone, children }: { tone: "muted"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[0.6rem] font-medium",
        tone === "muted" && "bg-muted/60 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
