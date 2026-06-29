"use client";

import * as React from "react";
import { DownloadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

// Captures the browser's install prompt and offers an in-app "Install" button.
type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

export function InstallPrompt() {
  const [deferred, setDeferred] = React.useState<BIPEvent | null>(null);

  React.useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!deferred) return null;

  return (
    <Button
      variant="outline"
      className="w-full"
      onClick={async () => {
        await deferred.prompt();
        await deferred.userChoice;
        setDeferred(null);
      }}
    >
      <DownloadIcon className="size-4" /> Pasang aplikasi Sefine
    </Button>
  );
}
