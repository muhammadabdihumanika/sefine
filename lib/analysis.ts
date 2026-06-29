/**
 * Dashboard analysis: a rolling 6-month view (3 past actuals + 3 future
 * projections) of income, spending, and recurring obligations.
 *
 * PAST figures come from real `transactions` rows. "Tagihan" in the past is the
 * subset of expenses created by `pay_bill` (source='recurring',
 * source_ref like 'bill:%').
 *
 * FUTURE figures are PROJECTIONS derived from recurring items:
 *   - bills (recurring) + installments → "kebutuhan" (obligations)
 *   - recurring_incomes → projected income
 * Projections are best-effort estimates based on each item's `frequency` and
 * `next_due_date`; they are not commitments.
 */

export type MonthPoint = {
  key: string; // YYYY-MM
  label: string; // short month name (id-ID)
  income: number; // past: actual income; future: projected income
  expense: number; // past: total expense; future: projected need (bills+cicilan)
  bills: number; // tagihan portion
  surplus: number; // income - expense
  future: boolean;
};

export type Analysis = {
  past: MonthPoint[]; // oldest → newest (3, incl. current month to-date)
  future: MonthPoint[]; // nearest → farthest (3)
  futureIncome: number; // window totals
  futureNeed: number;
  futureSurplus: number;
};

// ---------------------------------------------------------------------------
// Month math (pure)
// ---------------------------------------------------------------------------
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function lastOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
function ym(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { month: "short" }).format(d);
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------
type Recurring = {
  amount: number | string;
  frequency: string;
  next_due_date: string;
  end_date?: string | null;
  is_active?: boolean;
};
type Installment = {
  installment_amount: number | string;
  paid_count: number | null;
  term_months: number;
  status: string;
};

/**
 * Amount a recurring item contributes in a future month `m` (first of month),
 * given its next due date and frequency. Best-effort estimate.
 */
function projectRecurring(item: Recurring, m: Date): number {
  if (item.is_active === false) return 0;
  const amt = Number(item.amount) || 0;
  if (amt <= 0) return 0;

  const due = new Date(`${item.next_due_date}T00:00:00`);
  const mEnd = lastOfMonth(m);

  // Honour the item's end date (if it ended before this month, skip).
  if (item.end_date) {
    const end = new Date(`${item.end_date}T00:00:00`);
    if (end < m) return 0;
  }

  switch (item.frequency) {
    case "monthly":
      // Recurs once per month once it has started (next due on/before month end).
      return due <= mEnd ? amt : 0;
    case "weekly":
      // ~4 occurrences per month.
      return due <= mEnd ? amt * Math.round(daysInMonth(m) / 7) : 0;
    case "yearly":
    case "once":
    default:
      // Within a 3-month window a yearly/once item lands at most once: when its
      // next due date falls inside this month.
      return due >= m && due <= mEnd ? amt : 0;
  }
}

/**
 * Installment contribution for the `offset`-th future month (1, 2, or 3),
 * assuming monthly payments continue until the term is paid off.
 */
function projectInstallment(inst: Installment, offset: number): number {
  if (inst.status === "paid") return 0;
  const remaining = (inst.term_months || 0) - (inst.paid_count ?? 0);
  if (remaining <= 0) return 0;
  return offset <= remaining ? Number(inst.installment_amount) || 0 : 0;
}

// ---------------------------------------------------------------------------
// Input shapes (what the dashboard query returns)
// ---------------------------------------------------------------------------
export type AnalysisTx = {
  type: "income" | "expense" | "transfer_debit" | "transfer_credit";
  amount: number | string;
  source?: string | null;
  source_ref?: string | null;
  transaction_date: string;
};
export type AnalysisBill = Recurring & { is_paid?: boolean };
export type AnalysisIncome = Recurring;
export type AnalysisInstallment = Installment;

export function computeAnalysis(opts: {
  now: Date;
  transactions: AnalysisTx[];
  bills: AnalysisBill[];
  incomes: AnalysisIncome[];
  installments: AnalysisInstallment[];
}): Analysis {
  const { now, transactions, bills, incomes, installments } = opts;
  const thisMonth = startOfMonth(now);
  const pastMonths = [
    addMonths(thisMonth, -2),
    addMonths(thisMonth, -1),
    thisMonth,
  ];
  const futureMonths = [
    addMonths(thisMonth, 1),
    addMonths(thisMonth, 2),
    addMonths(thisMonth, 3),
  ];

  // ---- PAST: actuals grouped by month ----
  const pastByKey = new Map<string, MonthPoint>();
  for (const m of pastMonths) {
    const k = ym(m);
    pastByKey.set(k, {
      key: k,
      label: monthLabel(m),
      income: 0,
      expense: 0,
      bills: 0,
      surplus: 0,
      future: false,
    });
  }
  for (const t of transactions) {
    const k = (t.transaction_date || "").slice(0, 7);
    const pt = pastByKey.get(k);
    if (!pt) continue;
    const amt = Number(t.amount) || 0;
    if (t.type === "income") {
      pt.income += amt;
    } else if (t.type === "expense") {
      pt.expense += amt;
      if (
        t.source === "recurring" &&
        typeof t.source_ref === "string" &&
        t.source_ref.startsWith("bill:")
      ) {
        pt.bills += amt;
      }
    }
  }
  for (const pt of pastByKey.values()) pt.surplus = pt.income - pt.expense;

  // ---- FUTURE: projection per month ----
  const future: MonthPoint[] = futureMonths.map((m, idx) => {
    const offset = idx + 1;
    let income = 0;
    let need = 0;
    let tagihan = 0;
    for (const b of bills) {
      // A paid one-off bill won't recur.
      const active = !(b.frequency === "once" && b.is_paid);
      if (!active) continue;
      const a = projectRecurring(b, m);
      tagihan += a;
      need += a;
    }
    for (const inst of installments) need += projectInstallment(inst, offset);
    for (const inc of incomes) income += projectRecurring(inc, m);
    return {
      key: ym(m),
      label: monthLabel(m),
      income,
      expense: need,
      bills: tagihan,
      surplus: income - need,
      future: true,
    };
  });

  const futureIncome = future.reduce((s, p) => s + p.income, 0);
  const futureNeed = future.reduce((s, p) => s + p.expense, 0);

  return {
    past: [...pastByKey.values()],
    future,
    futureIncome,
    futureNeed,
    futureSurplus: futureIncome - futureNeed,
  };
}
