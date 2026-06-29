/**
 * Centralised access to public environment variables.
 * Throws early (at build/runtime of the call site) if misconfigured.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing env var ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const env = {
  supabaseUrl: required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  supabasePublishableKey: required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
} as const;
