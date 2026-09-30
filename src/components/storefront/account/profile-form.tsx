"use client";

import { useActionState } from "react";
import { updateProfileAction, type AccountFormState } from "@/app/(storefront)/account/actions";
import { FieldError } from "@/components/auth/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(updateProfileAction, {});
  return (
    <form action={action} className="max-w-md space-y-4" data-testid="profile-form">
      <div><Label htmlFor="name">Name</Label><Input id="name" name="name" defaultValue={name} required className="mt-1 bg-bg" /><FieldError errors={state.fieldErrors?.name} /></div>
      <div><Label htmlFor="email">Email</Label><Input id="email" value={email} readOnly disabled className="mt-1 bg-bg text-text-muted" /></div>
      {state.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
      {state.ok && <p className="text-sm text-brand" data-testid="profile-saved">Saved.</p>}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
    </form>
  );
}
