import type { NextRequest } from "next/server";

import { updateSession } from "@/utils/supabase/middleware";

// Next.js 16 renamed "middleware" to "proxy". This refreshes the Supabase
// session cookie on every request and does optimistic auth redirects.
// Authoritative auth enforcement lives in the protected layouts (server-side).
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on everything except static assets, images, and the manifest.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest|ico)$).*)",
  ],
};
