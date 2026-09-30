import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotForm } from "@/components/auth/forgot-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Forgot password" subtitle="We'll email you a one-time reset link.">
      <ForgotForm />
    </AuthCard>
  );
}
