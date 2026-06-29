"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { ObligationsSection } from "@/components/keuangan/obligations-section";
import { RecurringIncomesSection } from "@/components/keuangan/recurring-incomes-section";
import { BudgetsClient } from "@/components/budgets/budgets-client";
import { GoalsClient } from "@/components/goals/goals-client";
import type { BudgetRow } from "@/components/budgets/budgets-client";
import type { GoalRow } from "@/components/goals/goals-client";
import type { RecurringIncome } from "@/components/keuangan/recurring-incomes-section";
import type { Role } from "@/lib/rbac/permissions";

export type Obligation = {
  id: string;
  kind: "bill" | "installment" | "loan";
  name: string;
  amount: number;
  currency: string;
  date: string | null;
  isPaid: boolean;
  accountName?: string | null;
  frequency?: string;
  endDate?: string | null;
  term?: number | null;
  paidCount?: number;
  isLent?: boolean;
  rate?: number | null;
  counterparty?: string | null;
};

const TABS = [
  { key: "kewajiban", label: "Tagihan" },
  { key: "pendapatan", label: "Pendapatan" },
  { key: "anggaran", label: "Anggaran" },
  { key: "target", label: "Target" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function KeuanganClient({
  obligations,
  incomes,
  budgets,
  categories,
  goals,
  currency,
  role,
  activeOrgId,
}: {
  obligations: Obligation[];
  incomes: RecurringIncome[];
  budgets: BudgetRow[];
  categories: { id: string; name: string }[];
  goals: GoalRow[];
  currency: string;
  role: Role;
  activeOrgId: string;
}) {
  const [tab, setTab] = React.useState<TabKey>("kewajiban");

  const canManageObligations = role === "owner" || role === "admin";
  const canManageFinance = ["owner", "admin", "member"].includes(role);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted/60 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-lg py-2 text-sm font-medium transition",
              tab === t.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "kewajiban" && (
        <ObligationsSection
          obligations={obligations}
          currency={currency}
          canManage={canManageObligations}
          canPay={canManageFinance}
          activeOrgId={activeOrgId}
        />
      )}
      {tab === "pendapatan" && (
        <RecurringIncomesSection
          incomes={incomes}
          currency={currency}
          canManage={canManageObligations}
          canAct={canManageFinance}
          activeOrgId={activeOrgId}
        />
      )}
      {tab === "anggaran" && (
        <BudgetsClient
          budgets={budgets}
          categories={categories}
          currency={currency}
          canManage={canManageFinance}
        />
      )}
      {tab === "target" && (
        <GoalsClient
          goals={goals}
          currency={currency}
          canManage={canManageFinance}
        />
      )}
    </div>
  );
}
