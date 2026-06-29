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

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Kata sandi minimal 6 karakter.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/callback` },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data.session) {
      router.push("/");
      router.refresh();
      return;
    }
    toast.success("Akun dibuat. Cek email untuk verifikasi, lalu masuk.");
    router.push("/login");
  }

  return (
    <GlassCard variant="strong" className="p-6">
      <div className="mb-5">
        <h2 className="font-heading text-lg font-semibold">Buat akun</h2>
        <p className="text-sm text-muted-foreground">
          Gratis. Mulai catat keuangan pribadi atau rumah tangga Anda.
        </p>
      </div>

      <form onSubmit={handleRegister} className="space-y-3">
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
              autoComplete="new-password"
              placeholder="Minimal 6 karakter"
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
          disabled={loading}
        >
          {loading && <Loader2Icon className="size-4 animate-spin" />}
          Daftar
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        atau
        <div className="h-px flex-1 bg-border" />
      </div>

      <GoogleButton label="Daftar dengan Google" />

      <p className="mt-5 text-center text-sm text-muted-foreground">
        Sudah punya akun?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Masuk
        </Link>
      </p>
    </GlassCard>
  );
}
