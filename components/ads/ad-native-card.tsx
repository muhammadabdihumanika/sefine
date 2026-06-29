"use client";

import { SparkleIcon } from "lucide-react";

import { GlassCard } from "@/components/glass/glass-card";
import { isNativeApp } from "@/lib/ads";

/**
 * A native ad slot card inserted between list items. On web: hidden.
 * On Android: the Kotlin app can inject a real AdMob native ad into this slot.
 */
export function AdNativeCard() {
  if (!isNativeApp()) return null;
  return (
    <GlassCard variant="subtle" className="flex items-center gap-3 p-3 opacity-70">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-[0.6rem] font-bold text-muted-foreground">
        Ad
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">Ruang iklan</p>
        <p className="truncate text-xs text-muted-foreground">
          Slot native ad — terisi otomatis di app Android
        </p>
      </div>
      <SparkleIcon className="size-4 shrink-0 text-muted-foreground" />
    </GlassCard>
  );
}
