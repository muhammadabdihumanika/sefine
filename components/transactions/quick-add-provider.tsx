"use client";

import * as React from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TransactionSheetBody } from "@/components/transactions/transaction-sheet";

type Preset = "income" | "expense" | "transfer";

type QuickAddContextValue = {
  openQuickAdd: (preset?: Preset) => void;
  closeQuickAdd: () => void;
};

const QuickAddContext = React.createContext<QuickAddContextValue | null>(null);

export function useQuickAdd() {
  const ctx = React.useContext(QuickAddContext);
  if (!ctx) {
    throw new Error("useQuickAdd must be used within <QuickAddProvider>");
  }
  return ctx;
}

export function QuickAddProvider({
  activeOrgId,
  children,
}: {
  activeOrgId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [preset, setPreset] = React.useState<Preset>("expense");

  const value = React.useMemo<QuickAddContextValue>(
    () => ({
      openQuickAdd: (p?: Preset) => {
        if (p) setPreset(p);
        setOpen(true);
      },
      closeQuickAdd: () => setOpen(false),
    }),
    [],
  );

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="glass-strong inset-x-0 mx-auto max-h-[92dvh] max-w-md overflow-y-auto rounded-b-none rounded-t-3xl p-0"
        >
          <SheetHeader className="px-5 pt-5">
            <SheetTitle className="text-lg">Catat transaksi</SheetTitle>
            <SheetDescription>
              Uang masuk, keluar, atau pindah antar rekening.
            </SheetDescription>
          </SheetHeader>
          <div className="px-5 pb-8 pt-2">
            <TransactionSheetBody
              key={open ? "open" : "closed"}
              preset={preset}
              activeOrgId={activeOrgId}
              onDone={() => setOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </QuickAddContext.Provider>
  );
}
