import { redirect } from "next/navigation";

import { getSessionContext } from "@/lib/session";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getSessionContext();
  if (!ctx.userId) redirect("/login");

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
