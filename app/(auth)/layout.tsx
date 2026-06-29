import { BrandMark } from "@/components/shell/top-bar";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex flex-col items-center gap-2">
        <BrandMark className="size-10 text-lg" />
        <div className="text-center">
          <h1 className="font-heading text-xl font-semibold tracking-tight">
            Sefine
          </h1>
          <p className="text-sm text-muted-foreground">
            Keuangan pribadi &amp; rumah tangga
          </p>
        </div>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
