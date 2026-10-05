"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "./field-error";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4" data-testid="login-form">
      <input type="hidden" name="next" value={next} />
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" defaultValue={state.email} required className="mt-1 bg-bg" />
        <FieldError errors={state.fieldErrors?.email} />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot-password" className="-my-3 inline-flex min-h-11 items-center px-1 text-sm text-text-muted hover:text-text">Forgot?</Link>
        </div>
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="mt-1 bg-bg" />
        <FieldError errors={state.fieldErrors?.password} />
      </div>
      {state.error && <p className="text-sm text-danger" role="alert" data-testid="form-error">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full font-display text-lg tracking-wide">{pending ? "Logging in…" : "Log in"}</Button>
      <p className="text-center text-sm text-text-muted">New here? <Link href={`/register?next=${encodeURIComponent(next)}`} className="text-text underline-offset-4 hover:underline">Create an account</Link></p>
    </form>
  );
}
