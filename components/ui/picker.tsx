"use client";

import * as React from "react";
import { CheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function Picker<T extends string>({
  value,
  placeholder,
  options,
  onChange,
  className,
}: {
  value: T | null;
  placeholder: string;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const selected = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="lg"
            className={cn(
              "h-11 w-full justify-between font-normal",
              className,
            )}
          />
        }
      >
        {selected ? (
          selected.label
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="glass-strong max-h-72 w-(--anchor-width) overflow-y-auto"
      >
        {options.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-muted-foreground">
            Belum ada data.
          </div>
        ) : (
          options.map((o) => (
            <DropdownMenuItem key={o.value} onClick={() => onChange(o.value)}>
              {o.label}
              {o.value === value && (
                <CheckIcon className="ml-auto size-4 text-primary" />
              )}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
