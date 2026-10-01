"use client";

import { useActionState } from "react";
import { forgotPasswordAction, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "./field-error";

export function ForgotForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(forgotPasswordAction, {});
  if (state.ok) return <p className="text-sm text-text-muted" data-testid="forgot-sent">If that email has an account, a reset link is on its way. It works once and expires in an hour.</p>;
  return (
    <form action={action} className="space-y-4">
      <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" required className="mt-1 bg-bg" /><FieldError errors={state.fieldErrors?.email} /></div>
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Sending…" : "Send reset link"}</Button>
    </form>
  );
}
