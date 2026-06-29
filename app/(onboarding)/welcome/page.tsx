"use client";

import * as React from "react";
import { useActionState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassCard } from "@/components/glass/glass-card";
import { BrandMark } from "@/components/shell/top-bar";
import { createOrganization, joinOrganization } from "@/app/actions/org";

export default function WelcomePage() {
  const [tab, setTab] = React.useState<"create" | "join">("create");

  const [createState, createAction] = useActionState(createOrganization, {
    error: undefined,
  });
  const [joinState, joinAction] = useActionState(joinOrganization, {
    error: undefined,
  });

  React.useEffect(() => {
    if (createState?.error) toast.error(createState.error);
  }, [createState]);
  React.useEffect(() => {
    if (joinState?.error) toast.error(joinState.error);
  }, [joinState]);

  return (
    <GlassCard variant="strong" className="p-6">
      <div className="mb-5 flex flex-col items-center text-center">
        <BrandMark className="size-12 text-lg" />
        <h1 className="mt-2 font-heading text-lg font-semibold">
          Mulai dengan Sefine
        </h1>
        <p className="text-sm text-muted-foreground">
          Buat organisasi keuangan baru, atau gabung dengan kode undangan.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1">
        {(["create", "join"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={
              "rounded-lg py-2 text-sm font-medium transition " +
              (tab === t
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground")
            }
          >
            {t === "create" ? "Buat baru" : "Gabung"}
          </button>
        ))}
      </div>

      {tab === "create" ? (
        <form action={createAction} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nama organisasi</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue="Personal"
              placeholder="cth. Keluarga Budi"
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="currency">Mata uang</Label>
            <Input
              id="currency"
              name="currency"
              defaultValue="IDR"
              className="h-11"
            />
          </div>
          <Button type="submit" size="lg" className="h-11 w-full">
            Buat organisasi
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Anda menjadi owner dan dapat mengundang anggota lain.
          </p>
        </form>
      ) : (
        <form action={joinAction} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="invite_code">Kode undangan</Label>
            <Input
              id="invite_code"
              name="invite_code"
              required
              placeholder="cth. a1b2c3d4"
              className="h-11"
            />
          </div>
          <Button type="submit" size="lg" className="h-11 w-full">
            Gabung
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Minta kode dari owner/admin organisasi yang ingin Anda ikuti.
          </p>
        </form>
      )}
    </GlassCard>
  );
}
