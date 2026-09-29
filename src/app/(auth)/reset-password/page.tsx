import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetForm } from "@/components/auth/reset-form";

export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <AuthCard title="Reset password" subtitle="This link is missing its token.">
        <Link href="/forgot-password" className="text-sm underline-offset-4 hover:underline">Request a new link</Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Reset password" subtitle="Choose a new password.">
      <ResetForm token={token} />
    </AuthCard>
  );
}
