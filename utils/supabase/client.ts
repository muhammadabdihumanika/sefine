import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/lib/env";

/** Browser Supabase client (Client Components). */
export function createClient() {
  return createBrowserClient(env.supabaseUrl, env.supabasePublishableKey);
}
