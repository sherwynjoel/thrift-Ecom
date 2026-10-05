"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { zodFieldErrors } from "@/server/action-result";
import { signIn } from "@/server/auth";
import { clearGuestToken, readGuestToken } from "@/server/cart-cookie";
import { DomainError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { requestIp } from "@/server/request-ip";
import { safeNext } from "@/server/safe-next";
import { findUserIdByEmail, registerUser, requestPasswordReset, resetPassword } from "@/server/services/auth";
import { mergeGuestCartIntoUser } from "@/server/services/cart";
import { loginSchema, registerSchema, resetPasswordSchema, resetRequestSchema } from "@/lib/validation/auth";

/** `email`/`name` echo what was typed: React resets the form after an action, and a failed login shouldn't wipe it. */
export type AuthFormState = { error?: string; fieldErrors?: Record<string, string[]>; ok?: boolean; email?: string; name?: string };

const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const RATE_LIMITED: AuthFormState = { error: "Too many attempts. Please wait a minute and try again." };
const MINUTE = 60_000;

function typed(formData: FormData, ...keys: ("email" | "name")[]): Pick<AuthFormState, "email" | "name"> {
  const out: Pick<AuthFormState, "email" | "name"> = {};
  for (const k of keys) {
    const v = formData.get(k);
    if (typeof v === "string") out[k] = v.slice(0, 200);
  }
  return out;
}

function afterLogin(rawNext: FormDataEntryValue | null): string {
  const next = safeNext(typeof rawNext === "string" ? rawNext : null, ORIGIN);
  return `/auth/after-login?next=${encodeURIComponent(next)}`;
}

/**
 * Credentials sign-in that finishes inside the action and redirects with a relative path.
 * Never route this through /auth/after-login: Next follows an action's redirect with an internal fetch from
 * http://0.0.0.0:3000, that route's absolute https redirect made the hop cross-origin, fetch dropped the fresh
 * session cookie, and behind the proxy the shopper got the login page back with no error.
 * Throws AuthError on bad credentials and NEXT_REDIRECT on success.
 */
async function signInAndRedirect(email: string, password: string, rawNext: FormDataEntryValue | null): Promise<never> {
  await signIn("credentials", { email, password, redirect: false });
  const guestToken = await readGuestToken();
  if (guestToken) {
    try {
      const userId = await findUserIdByEmail(email);
      if (userId) await mergeGuestCartIntoUser(guestToken, userId);
      await clearGuestToken();
    } catch (err) {
      // A failed bag merge must not block the login itself; the guest bag stays for the next attempt.
      console.error("[signInAndRedirect] guest cart merge failed", err);
    }
  }
  redirect(safeNext(typeof rawNext === "string" ? rawNext : null, ORIGIN));
}

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const ip = await requestIp();
  if (!rateLimit(`login:${ip}`, 20, MINUTE).ok) return RATE_LIMITED;
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { ...typed(formData, "email"), fieldErrors: zodFieldErrors(parsed.error) };
  try {
    await signInAndRedirect(parsed.data.email, parsed.data.password, formData.get("next"));
  } catch (err) {
    if (err instanceof AuthError) return { ...typed(formData, "email"), error: "Incorrect email or password" };
    throw err; // NEXT_REDIRECT
  }
  return { ok: true };
}

export async function registerAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const ip = await requestIp();
  if (!rateLimit(`register:${ip}`, 10, MINUTE).ok) return RATE_LIMITED;
  const parsed = registerSchema.safeParse({ name: formData.get("name"), email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { ...typed(formData, "email", "name"), fieldErrors: zodFieldErrors(parsed.error) };
  try {
    await registerUser(parsed.data);
  } catch (err) {
    if (err instanceof DomainError) return { ...typed(formData, "email", "name"), error: err.message };
    throw err;
  }
  try {
    await signInAndRedirect(parsed.data.email, parsed.data.password, formData.get("next"));
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
  const ip = await requestIp();
  if (!rateLimit(`forgot:${ip}`, 5, MINUTE).ok) return RATE_LIMITED;
  const parsed = resetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  if (!rateLimit(`forgot-email:${parsed.data.email}`, 3, 15 * MINUTE).ok) return RATE_LIMITED;
  try {
    await requestPasswordReset(parsed.data.email);
  } catch (err) {
    // Never let a mail-provider failure crash the action or reveal whether the account exists.
    console.error("[forgotPasswordAction]", err);
  }
  return { ok: true };
}

export async function resetPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const ip = await requestIp();
  if (!rateLimit(`reset:${ip}`, 10, MINUTE).ok) return RATE_LIMITED;
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
