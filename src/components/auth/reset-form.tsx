"use client";

import { useActionState } from "react";
import { resetPasswordAction, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "./field-error";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div><Label htmlFor="password">New password</Label><Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="mt-1 bg-bg" /><FieldError errors={state.fieldErrors?.password} /></div>
      {state.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Saving…" : "Set new password"}</Button>
    </form>
  );
}
