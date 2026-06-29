import * as React from "react";

import { cn } from "@/lib/utils";

export function GlassCard({
  className,
  sheen = false,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & {
  sheen?: boolean;
  variant?: "default" | "strong" | "subtle";
}) {
  return (
    <div
      data-slot="glass-card"
      className={cn(
        "rounded-2xl",
        variant === "default" && "glass",
        variant === "strong" && "glass-strong",
        variant === "subtle" && "glass-subtle",
        sheen && "glass-sheen",
        className,
      )}
      {...props}
    />
  );
}
