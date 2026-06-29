"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/utils/supabase/client";

/**
 * Subscribes to Realtime changes for the active org's transactions and
 * refreshes the route so the dashboard/lists stay in sync across devices
 * (e.g. a transaction created via WhatsApp appears instantly).
 *
 * Requires `public.transactions` to be added to the `supabase_realtime`
 * publication (one-time: alter publication supabase_realtime add table public.transactions;).
 */
export function LiveRefresh({ orgId }: { orgId: string }) {
  const router = useRouter();
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  React.useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`org-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          clearTimeout(timer.current);
          timer.current = setTimeout(() => router.refresh(), 300);
        },
      )
      .subscribe();

    return () => {
      clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [orgId, router]);

  return null;
}
