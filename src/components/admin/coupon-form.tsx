"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveCouponAction } from "@/app/admin/coupons/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fromDateTimeLocal, parseIntField, parseRupeesField, toDateTimeLocal } from "@/lib/form-parse";
import { paiseToRupees } from "@/lib/money";
import { describeCoupon } from "@/lib/promotion-labels";
import type { CouponInput } from "@/lib/validation/promotions";
import type { CouponRow } from "@/server/services/admin-promotions";
import { FieldError } from "./field-error";
import { RadioCards } from "./radio-cards";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const FIELD = "mt-1 h-11 bg-bg";
type CouponType = CouponRow["type"];

export function CouponForm({ coupon }: { coupon: CouponRow | null }) {
  const [code, setCode] = useState(coupon?.code ?? "");
  const [type, setType] = useState<CouponType>(coupon?.type ?? "PERCENT");
  const [value, setValue] = useState(coupon ? (coupon.type === "FLAT" ? paiseToRupees(coupon.value) : String(coupon.value)) : "");
  const [minSubtotal, setMinSubtotal] = useState(coupon?.minSubtotalPaise ? paiseToRupees(coupon.minSubtotalPaise) : "");
  const [maxDiscount, setMaxDiscount] = useState(paiseToRupees(coupon?.maxDiscountPaise));
  // datetime-local values are in the browser's zone, so they are filled in after mount (the server
  // render doesn't know the admin's zone and would otherwise disagree with the hydrated value).
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [usageLimit, setUsageLimit] = useState(coupon?.usageLimit ? String(coupon.usageLimit) : "");
  const [perUserLimit, setPerUserLimit] = useState(coupon?.perUserLimit ? String(coupon.perUserLimit) : "");
  const [active, setActive] = useState(coupon?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const codeLocked = Boolean(coupon && coupon.uses > 0);

  useEffect(() => {
    setStartsAt(toDateTimeLocal(coupon?.startsAt ?? null));
    setEndsAt(toDateTimeLocal(coupon?.endsAt ?? null));
  }, [coupon?.startsAt, coupon?.endsAt]);

  const parsedValue = type === "PERCENT" ? parseIntField(value, { optional: false }) : parseRupeesField(value, { optional: false });
  const preview = typeof parsedValue === "number"
    ? describeCoupon({ type, value: parsedValue, maxDiscountPaise: type === "PERCENT" ? (parseRupeesField(maxDiscount, { optional: true }) ?? null) : null })
    : null;

  const save = () => {
    const local: Record<string, string[]> = {};
    const minSubtotalPaise = parseRupeesField(minSubtotal, { optional: true });
    const maxDiscountPaise = type === "PERCENT" ? parseRupeesField(maxDiscount, { optional: true }) : null;
    const usage = parseIntField(usageLimit, { optional: true });
    const perUser = parseIntField(perUserLimit, { optional: true });
    const starts = fromDateTimeLocal(startsAt);
    const ends = fromDateTimeLocal(endsAt);
    if (parsedValue === undefined || parsedValue === null) local.value = [type === "PERCENT" ? "Enter a whole number" : "Enter an amount in rupees"];
    if (minSubtotalPaise === undefined) local.minSubtotalPaise = ["Enter an amount in rupees"];
    if (maxDiscountPaise === undefined) local.maxDiscountPaise = ["Enter an amount in rupees"];
    if (usage === undefined) local.usageLimit = ["Enter a whole number"];
    if (perUser === undefined) local.perUserLimit = ["Enter a whole number"];
    if (starts === undefined) local.startsAt = ["Enter a valid date"];
    if (ends === undefined) local.endsAt = ["Enter a valid date"];
    if (Object.keys(local).length) {
      setErrors(local);
      toast.error("Fix the highlighted fields");
      return;
    }
    const input: CouponInput = {
      code, type, value: parsedValue as number, minSubtotalPaise: minSubtotalPaise ?? 0, maxDiscountPaise: maxDiscountPaise ?? null,
      startsAt: starts ?? null, endsAt: ends ?? null, usageLimit: usage ?? null, perUserLimit: perUser ?? null, active,
    };
    start(async () => {
      try {
        const r = await saveCouponAction(coupon?.id ?? null, input);
        if (!r.ok) {
          setErrors(r.fieldErrors ?? {});
          toast.error(r.message);
          return;
        }
        setErrors({});
        toast.success("Saved");
        router.push("/admin/coupons");
        router.refresh();
      } catch {
        toast.error(GENERIC_ERROR);
      }
    });
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="max-w-2xl space-y-5 rounded-md border border-border bg-surface p-4 sm:p-5" data-testid="coupon-form" noValidate>
      <div>
        <Label htmlFor="cp-code">Code</Label>
        <Input
          id="cp-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          readOnly={codeLocked}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className={`${FIELD} font-mono uppercase ${codeLocked ? "opacity-70" : ""}`}
          aria-describedby={codeLocked ? "cp-code-hint" : undefined}
        />
        {codeLocked && <p id="cp-code-hint" className="mt-1 text-xs text-text-muted">Used {coupon!.uses} {coupon!.uses === 1 ? "time" : "times"}, so the code is locked.</p>}
        <FieldError errors={errors.code} />
      </div>

      <RadioCards legend="Type" name="cp-type" value={type} onChange={setType} options={[{ value: "PERCENT", label: "Percent off" }, { value: "FLAT", label: "Flat ₹ off" }]} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="cp-value">{type === "PERCENT" ? "Percent (1–90)" : "Amount (₹)"}</Label>
          <Input id="cp-value" value={value} onChange={(e) => setValue(e.target.value)} inputMode={type === "PERCENT" ? "numeric" : "decimal"} className={FIELD} />
          <FieldError errors={errors.value} />
        </div>
        {type === "PERCENT" && (
          <div>
            <Label htmlFor="cp-max">Maximum discount (₹)</Label>
            <Input id="cp-max" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} inputMode="decimal" placeholder="No cap" className={FIELD} />
            <FieldError errors={errors.maxDiscountPaise} />
          </div>
        )}
        <div>
          <Label htmlFor="cp-min">Minimum order (₹)</Label>
          <Input id="cp-min" value={minSubtotal} onChange={(e) => setMinSubtotal(e.target.value)} inputMode="decimal" placeholder="None" className={FIELD} />
          <FieldError errors={errors.minSubtotalPaise} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="cp-starts">Starts</Label>
          <input id="cp-starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="mt-1 h-11 w-full min-w-0 rounded-md border border-border bg-bg px-3 text-sm" />
          <FieldError errors={errors.startsAt} />
        </div>
        <div>
          <Label htmlFor="cp-ends">Ends</Label>
          <input id="cp-ends" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="mt-1 h-11 w-full min-w-0 rounded-md border border-border bg-bg px-3 text-sm" />
          <FieldError errors={errors.endsAt} />
        </div>
        <p className="-mt-2 text-xs text-text-muted sm:col-span-2">Leave both blank to run it until you switch it off.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="cp-usage">Total uses</Label>
          <Input id="cp-usage" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} inputMode="numeric" placeholder="Unlimited" className={FIELD} />
          <FieldError errors={errors.usageLimit} />
        </div>
        <div>
          <Label htmlFor="cp-per-user">Uses per customer</Label>
          <Input id="cp-per-user" value={perUserLimit} onChange={(e) => setPerUserLimit(e.target.value)} inputMode="numeric" placeholder="Unlimited" className={FIELD} />
          <FieldError errors={errors.perUserLimit} />
        </div>
      </div>

      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-5 accent-brand" />
        Active (customers can use it)
      </label>

      {preview && <p className="rounded-md bg-bg p-3 text-sm" aria-live="polite" data-testid="coupon-preview">{code || "CODE"}: {preview}</p>}

      <Button type="submit" disabled={pending} className="h-11 w-full px-6 sm:w-auto" data-testid="save-coupon">{pending ? "Saving…" : coupon ? "Save changes" : "Create coupon"}</Button>
    </form>
  );
}
