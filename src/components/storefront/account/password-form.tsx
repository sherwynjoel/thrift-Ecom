"use client";

import { useActionState } from "react";
import { changePasswordAction, type AccountFormState } from "@/app/(storefront)/account/actions";
import { FieldError } from "@/components/auth/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(changePasswordAction, {});
  if (!hasPassword) return <p className="text-sm text-text-muted">You signed up with Google, so there is no password to change here.</p>;
  return (
    <form action={action} className="max-w-md space-y-4" data-testid="password-form">
      <div><Label htmlFor="current">Current password</Label><Input id="current" name="current" type="password" autoComplete="current-password" required className="mt-1 bg-bg" /><FieldError errors={state.fieldErrors?.current} /></div>
      <div><Label htmlFor="next">New password</Label><Input id="next" name="next" type="password" autoComplete="new-password" required minLength={8} className="mt-1 bg-bg" /><FieldError errors={state.fieldErrors?.next} /></div>
      {state.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
      {state.ok && <p className="text-sm text-brand">Password updated.</p>}
      <Button type="submit" disabled={pending}>{pending ? "Updating…" : "Update password"}</Button>
    </form>
  );
}
