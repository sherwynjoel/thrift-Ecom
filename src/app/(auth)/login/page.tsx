import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { GoogleButton } from "@/components/auth/google-button";
import { LoginForm } from "@/components/auth/login-form";
import { auth } from "@/server/auth";
import { googleEnabled } from "@/server/auth.config";
import { safeNext } from "@/server/safe-next";

export const metadata: Metadata = { title: "Log in" };

type Props = { searchParams: Promise<{ next?: string; callbackUrl?: string; reset?: string }> };

const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNext(sp.next ?? sp.callbackUrl ?? null, ORIGIN);
  const session = await auth();
  const needsAdmin = Boolean(session?.user) && next.startsWith("/admin") && session?.user.role !== "ADMIN";
  return (
    <AuthCard title="Log in" subtitle={needsAdmin ? "You need an admin account for that page." : sp.reset ? "Password updated. Log in with the new one." : "Welcome back."}>
      <LoginForm next={next} />
      {googleEnabled && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-text-muted"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
          <GoogleButton next={next} />
        </>
      )}
    </AuthCard>
  );
}
