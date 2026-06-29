import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/utils/supabase/server";

// Exchange the auth code (from OAuth / magic link) for a session, then redirect.
export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
