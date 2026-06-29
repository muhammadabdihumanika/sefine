"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";

function GoogleIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.9 3.4 14.7 2.4 12 2.4 6.9 2.4 2.8 6.5 2.8 11.9S6.9 21.4 12 21.4c5.4 0 9-3.8 9-9.1 0-.6-.06-1.1-.16-1.6H12z"
      />
    </svg>
  );
}

export function GoogleButton({ label }: { label: string }) {
  const supabase = createClient();
  const [loading, setLoading] = React.useState(false);

  async function signInWithGoogle() {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/callback` },
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="h-11 w-full"
      onClick={signInWithGoogle}
      disabled={loading}
    >
      <GoogleIcon className="size-4" />
      {label}
    </Button>
  );
}
