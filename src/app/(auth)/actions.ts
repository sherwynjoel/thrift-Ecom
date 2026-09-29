"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { zodFieldErrors } from "@/server/action-result";
import { signIn } from "@/server/auth";
import { DomainError } from "@/server/errors";
import { safeNext } from "@/server/safe-next";
import { registerUser, requestPasswordReset, resetPassword } from "@/server/services/auth";
import { loginSchema, registerSchema, resetPasswordSchema, resetRequestSchema } from "@/lib/validation/auth";

export type AuthFormState = { error?: string; fieldErrors?: Record<string, string[]>; ok?: boolean };

const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

function afterLogin(rawNext: FormDataEntryValue | null): string {
  const next = safeNext(typeof rawNext === "string" ? rawNext : null, ORIGIN);
  return `/auth/after-login?next=${encodeURIComponent(next)}`;
}

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  try {
    await signIn("credentials", { ...parsed.data, redirectTo: afterLogin(formData.get("next")) });
  } catch (err) {
    if (err instanceof AuthError) return { error: "Incorrect email or password" };
    throw err; // NEXT_REDIRECT
  }
  return { ok: true };
}

export async function registerAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({ name: formData.get("name"), email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  try {
    await registerUser(parsed.data);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
  try {
    await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirectTo: afterLogin(formData.get("next")) });
  } catch (err) {
    if (err instanceof AuthError) return { error: "Account created, but sign-in failed. Please log in." };
    throw err;
  }
  return { ok: true };
}

export async function googleAction(formData: FormData): Promise<void> {
  await signIn("google", { redirectTo: afterLogin(formData.get("next")) });
}

export async function forgotPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = resetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  await requestPasswordReset(parsed.data.email);
  return { ok: true };
}

export async function resetPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({ token: formData.get("token"), password: formData.get("password") });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  try {
    await resetPassword(parsed.data.token, parsed.data.password);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
  redirect("/login?reset=1");
}
