"use client";

import { useId, useState, useTransition } from "react";
import { saveAddressAction } from "@/app/(storefront)/account/addresses/actions";
import { FieldError } from "@/components/auth/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INDIA_STATES } from "@/lib/india-states";
import { EMPTY_ADDRESS, type AddressFormValues } from "@/lib/validation/address";
import type { AddressView } from "@/server/services/addresses";

type Errors = Record<string, string[]>;

function toValues(a: AddressView | null | undefined): AddressFormValues {
  if (!a) return EMPTY_ADDRESS;
  return { fullName: a.fullName, phone: a.phone, line1: a.line1, line2: a.line2 ?? "", landmark: a.landmark ?? "", city: a.city, state: a.state, pincode: a.pincode, isDefault: a.isDefault };
}

export function AddressForm({ initial, onSaved, onCancel, forceDefault = false }: {
  initial?: AddressView | null; onSaved: (a: AddressView) => void; onCancel?: () => void; forceDefault?: boolean;
}) {
  const uid = useId();
  const [values, setValues] = useState<AddressFormValues>(() => ({ ...toValues(initial), isDefault: forceDefault || Boolean(initial?.isDefault) }));
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof AddressFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const id = (k: string) => `${uid}-${k}`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await saveAddressAction(initial?.id ?? null, values);
      if (res.ok) {
        setErrors({});
        setMessage(null);
        onSaved(res.data);
      } else {
        setErrors(res.fieldErrors ?? {});
        setMessage(res.message);
      }
    });
  }

  const field = "mt-1 h-11 bg-bg";
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" data-testid="address-form" noValidate>
      <div><Label htmlFor={id("name")}>Full name</Label><Input id={id("name")} autoComplete="name" value={values.fullName} onChange={set("fullName")} className={field} aria-invalid={Boolean(errors.fullName)} /><FieldError errors={errors.fullName} /></div>
      <div><Label htmlFor={id("phone")}>Mobile number</Label><Input id={id("phone")} type="tel" inputMode="numeric" autoComplete="tel-national" value={values.phone} onChange={set("phone")} className={field} aria-invalid={Boolean(errors.phone)} /><FieldError errors={errors.phone} /></div>
      <div className="sm:col-span-2"><Label htmlFor={id("line1")}>House, flat, street</Label><Input id={id("line1")} autoComplete="address-line1" value={values.line1} onChange={set("line1")} className={field} aria-invalid={Boolean(errors.line1)} /><FieldError errors={errors.line1} /></div>
      <div className="sm:col-span-2"><Label htmlFor={id("line2")}>Area, locality (optional)</Label><Input id={id("line2")} autoComplete="address-line2" value={values.line2} onChange={set("line2")} className={field} aria-invalid={Boolean(errors.line2)} /><FieldError errors={errors.line2} /></div>
      <div><Label htmlFor={id("landmark")}>Landmark (optional)</Label><Input id={id("landmark")} autoComplete="off" value={values.landmark} onChange={set("landmark")} className={field} aria-invalid={Boolean(errors.landmark)} /><FieldError errors={errors.landmark} /></div>
      <div><Label htmlFor={id("city")}>City</Label><Input id={id("city")} autoComplete="address-level2" value={values.city} onChange={set("city")} className={field} aria-invalid={Boolean(errors.city)} /><FieldError errors={errors.city} /></div>
      <div>
        <Label htmlFor={id("state")}>State</Label>
        <select id={id("state")} autoComplete="address-level1" value={values.state} onChange={set("state")} className="mt-1 h-11 w-full rounded-lg border border-input bg-bg px-2.5 text-base md:text-sm" aria-invalid={Boolean(errors.state)}>
          <option value="">Choose a state</option>
          {INDIA_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <FieldError errors={errors.state} />
      </div>
      <div><Label htmlFor={id("pincode")}>PIN code</Label><Input id={id("pincode")} inputMode="numeric" maxLength={6} autoComplete="postal-code" value={values.pincode} onChange={set("pincode")} className={field} aria-invalid={Boolean(errors.pincode)} /><FieldError errors={errors.pincode} /></div>
      {!forceDefault && (
        <div className="sm:col-span-2">
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" checked={values.isDefault} onChange={set("isDefault")} className="size-5 accent-brand" />
            Make this my default address
          </label>
          {initial?.isDefault && !values.isDefault && (
            <p className="mt-1 text-xs text-text-muted">
              Your only default address stays default — set another address as default instead.
            </p>
          )}
        </div>
      )}
      {message && <p className="text-sm text-danger sm:col-span-2" role="alert">{message}</p>}
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending} className="h-11 px-5">{pending ? "Saving…" : "Save address"}</Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel} className="h-11 px-5">Cancel</Button>}
      </div>
    </form>
  );
}
