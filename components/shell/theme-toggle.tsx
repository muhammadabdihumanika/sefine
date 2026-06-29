"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Ganti tema terang/gelap"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {/* render a stable icon until mounted to avoid hydration mismatch */}
      {mounted ? isDark ? <SunIcon /> : <MoonIcon /> : <MoonIcon />}
    </Button>
  );
}
