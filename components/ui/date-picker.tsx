"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Calendar date picker. Works with YYYY-MM-DD strings (the app's convention).
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Pilih tanggal",
  className,
}: {
  value: string | null;
  onChange: (yyyyMmDd: string | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const date = value ? new Date(value + "T00:00:00") : null;
  const label = date
    ? new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date)
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="lg"
            className={cn("h-11 w-full justify-between font-normal", className)}
          />
        }
      >
        <span className={cn(!value && "text-muted-foreground")}>{label}</span>
        <CalendarIcon className="size-4 opacity-60" />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date ?? undefined}
          onSelect={(d) => {
            onChange(d ? d.toISOString().slice(0, 10) : null);
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
