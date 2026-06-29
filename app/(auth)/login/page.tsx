"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassCard } from "@/components/glass/glass-card";
import { GoogleButton } from "@/components/auth/google-button";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState<"password" | "link" | null>(
    null,
  );

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading("password");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function handleMagicLink() {
    if (!email) {
      toast.error("Masukkan email terlebih dulu.");
      return;
    }
    setLoading("link");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/callback` },
    });
    setLoading(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Link masuk dikirim ke ${email}`);
  }

  return (
    <GlassCard variant="strong" className="p-6">
      <div className="mb-5">
        <h2 className="font-heading text-lg font-semibold">Masuk</h2>
        <p className="text-sm text-muted-foreground">
          Selamat datang kembali. Lanjutkan mencatat keuangan Anda.
        </p>
      </div>

      <form onSubmit={handlePassword} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="kamu@email.com"
            required
            className="h-11"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Kata sandi</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              required
              className="h-11 pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground"
              aria-label={showPassword ? "Sembunyikan sandi" : "Tampilkan sandi"}
            >
              {showPassword ? (
                <EyeOffIcon className="size-4" />
              ) : (
                <EyeIcon className="size-4" />
              )}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          size="lg"
          className="h-11 w-full"
          disabled={loading !== null}
        >
          {loading === "password" && (
            <Loader2Icon className="size-4 animate-spin" />
          )}
          Masuk
        </Button>
      </form>

      <Button
        type="button"
        variant="link"
        className="mt-1 h-9 w-full text-sm"
        onClick={handleMagicLink}
        disabled={loading !== null}
      >
        {loading === "link" ? "Mengirim link…" : "Kirim link masuk ke email"}
      </Button>

      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        atau
        <div className="h-px flex-1 bg-border" />
      </div>

      <GoogleButton label="Masuk dengan Google" />

      <p className="mt-5 text-center text-sm text-muted-foreground">
        Belum punya akun?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Daftar
        </Link>
      </p>
    </GlassCard>
  );
}
