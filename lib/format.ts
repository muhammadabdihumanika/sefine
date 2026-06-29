/**
 * Formatting helpers (Indonesian locale, IDR by default).
 */

export function formatCurrency(
  amount: number,
  currency = "IDR",
  options?: Intl.NumberFormatOptions,
): string {
  try {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
      ...options,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("id-ID")}`;
  }
}

/** Compact currency: Rp 1,2 jt / Rp 3,4 rb / Rp 2,1 M */
export function formatCompactCurrency(amount: number, currency = "IDR"): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  const num = (value: number) =>
    new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value);
  const prefix = currency === "IDR" ? "Rp" : `${currency} `;

  if (abs >= 1_000_000_000) return `${sign}${prefix}${num(abs / 1_000_000_000)} M`;
  if (abs >= 1_000_000) return `${sign}${prefix}${num(abs / 1_000_000)} jt`;
  if (abs >= 1_000) return `${sign}${prefix}${num(abs / 1_000)} rb`;
  return `${sign}${prefix}${num(abs)}`;
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(
    amount,
  );
}

export function formatDate(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  }).format(d);
}

export function formatRelativeDay(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const today = new Date();
  const diffDays = Math.round(
    (new Date(d.toDateString()).getTime() -
      new Date(today.toDateString()).getTime()) /
      86_400_000,
  );
  if (diffDays === 0) return "Hari ini";
  if (diffDays === 1) return "Besok";
  if (diffDays === -1) return "Kemarin";
  return formatDate(d);
}
