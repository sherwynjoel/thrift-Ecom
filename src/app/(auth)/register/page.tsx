import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { GoogleButton } from "@/components/auth/google-button";
import { RegisterForm } from "@/components/auth/register-form";
import { googleEnabled } from "@/server/auth.config";
import { safeNext } from "@/server/safe-next";

export const metadata: Metadata = { title: "Create account" };

const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: raw } = await searchParams;
  const next = safeNext(raw ?? null, ORIGIN);
  return (
    <AuthCard title="Create account" subtitle="Save your bag, track orders, reuse your designs.">
      <RegisterForm next={next} />
      {googleEnabled && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-text-muted"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
          <GoogleButton next={next} />
        </>
      )}
    </AuthCard>
  );
}
