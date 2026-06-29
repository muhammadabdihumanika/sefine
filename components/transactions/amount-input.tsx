"use client";

import * as React from "react";

import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Big numeric input that formats with thousand separators as you type. */
export function AmountInput({
  value,
  onValueChange,
  className,
  autoFocus,
}: {
  value: number | null;
  onValueChange: (n: number | null) => void;
  className?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = React.useState(() =>
    value ? formatNumber(value) : "",
  );

  React.useEffect(() => {
    setText(value ? formatNumber(value) : "");
  }, [value]);

  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lg font-semibold text-muted-foreground">
        Rp
      </span>
      <input
        autoFocus={autoFocus}
        inputMode="numeric"
        placeholder="0"
        value={text}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          const n = digits ? parseInt(digits, 10) : null;
          onValueChange(n);
          setText(n ? formatNumber(n) : "");
        }}
        className="h-14 w-full rounded-xl border border-input bg-transparent pl-11 pr-3 text-right text-2xl font-bold tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </div>
  );
}
