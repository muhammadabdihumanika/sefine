"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon, MonitorIcon } from "lucide-react";

import { GlassCard } from "@/components/glass/glass-card";
import { cn } from "@/lib/utils";

export default function AppearancePage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const options = [
    { value: "light", label: "Terang", icon: SunIcon },
    { value: "dark", label: "Gelap", icon: MoonIcon },
    { value: "system", label: "Sistem", icon: MonitorIcon },
  ] as const;

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-xl font-semibold">Tampilan</h1>
      <GlassCard className="p-4">
        <p className="text-sm font-medium">Tema</p>
        <p className="text-xs text-muted-foreground">
          Pilih tampilan aplikasi (disimpan di perangkat ini).
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {options.map((o) => {
            const Icon = o.icon;
            const active = mounted && theme === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setTheme(o.value)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border p-4 text-sm transition",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
                {o.label}
              </button>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
