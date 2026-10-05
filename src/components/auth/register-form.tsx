"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "./field-error";

export function RegisterForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(registerAction, {});
  return (
    <form action={action} className="space-y-4" data-testid="register-form">
      <input type="hidden" name="next" value={next} />
      <div><Label htmlFor="name">Name</Label><Input id="name" name="name" autoComplete="name" defaultValue={state.name} required className="mt-1 bg-bg" /><FieldError errors={state.fieldErrors?.name} /></div>
      <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" defaultValue={state.email} required className="mt-1 bg-bg" /><FieldError errors={state.fieldErrors?.email} /></div>
      <div><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="mt-1 bg-bg" /><FieldError errors={state.fieldErrors?.password} /></div>
      {state.error && <p className="text-sm text-danger" role="alert" data-testid="form-error">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full font-display text-lg tracking-wide">{pending ? "Creating…" : "Create account"}</Button>
      <p className="text-center text-sm text-text-muted">Already have one? <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-text underline-offset-4 hover:underline">Log in</Link></p>
    </form>
  );
}
