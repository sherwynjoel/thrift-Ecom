"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveOfferAction } from "@/app/admin/offers/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fromDateTimeLocal, parseIntField, parseRupeesField, toDateTimeLocal } from "@/lib/form-parse";
import { paiseToRupees } from "@/lib/money";
import { describeOffer } from "@/lib/promotion-labels";
import type { OfferInput } from "@/lib/validation/promotions";
import type { OfferRow } from "@/server/services/admin-promotions";
import { FieldError } from "./field-error";
import { RadioCards } from "./radio-cards";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const FIELD = "mt-1 h-11 bg-bg";
const NATIVE = "mt-1 h-11 w-full min-w-0 rounded-md border border-border bg-bg px-3 text-sm";
type OfferType = OfferRow["type"];

export function OfferForm({ offer, collections }: { offer: OfferRow | null; collections: { id: string; name: string }[] }) {
  const [label, setLabel] = useState(offer?.label ?? "");
  const [type, setType] = useState<OfferType>(offer?.type ?? "BUNDLE_PRICE");
  const [minQty, setMinQty] = useState(String(offer?.minQty ?? 3));
  const [price, setPrice] = useState(paiseToRupees(offer?.pricePaise));
  const [percent, setPercent] = useState(offer?.percent ? String(offer.percent) : "");
  const [collectionId, setCollectionId] = useState(offer?.collectionId ?? "");
  const [active, setActive] = useState(offer?.active ?? true);
  // Filled after mount: datetime-local values are in the browser's zone (see CouponForm).
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    setStartsAt(toDateTimeLocal(offer?.startsAt ?? null));
    setEndsAt(toDateTimeLocal(offer?.endsAt ?? null));
  }, [offer?.startsAt, offer?.endsAt]);

  const qty = parseIntField(minQty, { optional: false });
  const pricePaise = type === "BUNDLE_PRICE" ? parseRupeesField(price, { optional: true }) : null;
  const pct = type === "QTY_PERCENT" ? parseIntField(percent, { optional: true }) : null;
  const ready = typeof qty === "number" && (type === "BUNDLE_PRICE" ? typeof pricePaise === "number" : typeof pct === "number");
  const preview = ready ? describeOffer({ type, minQty: qty, pricePaise: pricePaise ?? null, percent: pct ?? null }) : null;
  const scope = collections.find((c) => c.id === collectionId)?.name;

  const save = () => {
    const local: Record<string, string[]> = {};
    const starts = fromDateTimeLocal(startsAt);
    const ends = fromDateTimeLocal(endsAt);
    if (qty === undefined || qty === null) local.minQty = ["Enter a whole number"];
    if (pricePaise === undefined) local.pricePaise = ["Enter an amount in rupees"];
    if (pct === undefined) local.percent = ["Enter a whole number"];
    if (starts === undefined) local.startsAt = ["Enter a valid date"];
    if (ends === undefined) local.endsAt = ["Enter a valid date"];
    if (Object.keys(local).length) {
      setErrors(local);
      toast.error("Fix the highlighted fields");
      return;
    }
    const input: OfferInput = {
      label, type, minQty: qty as number, pricePaise: pricePaise ?? null, percent: pct ?? null,
      collectionId: collectionId || null, active, startsAt: starts ?? null, endsAt: ends ?? null,
    };
    start(async () => {
      try {
        const r = await saveOfferAction(offer?.id ?? null, input);
        if (!r.ok) {
          setErrors(r.fieldErrors ?? {});
          toast.error(r.message);
          return;
        }
        setErrors({});
        toast.success("Saved");
        router.push("/admin/offers");
        router.refresh();
      } catch {
        toast.error(GENERIC_ERROR);
      }
    });
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="max-w-2xl space-y-5 rounded-md border border-border bg-surface p-4 sm:p-5" data-testid="offer-form" noValidate>
      <div>
        <Label htmlFor="of-label">Name shown to customers</Label>
        <Input id="of-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Any 3 for ₹999" className={FIELD} />
        <FieldError errors={errors.label} />
      </div>

      <RadioCards
        legend="Type"
        name="of-type"
        value={type}
        onChange={setType}
        options={[{ value: "BUNDLE_PRICE", label: "Bundle price (any N for ₹X)" }, { value: "QTY_PERCENT", label: "Percent off N or more" }]}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="of-qty">{type === "BUNDLE_PRICE" ? "Items in the bundle" : "Minimum items"}</Label>
          <Input id="of-qty" value={minQty} onChange={(e) => setMinQty(e.target.value)} inputMode="numeric" className={FIELD} />
          <FieldError errors={errors.minQty} />
        </div>
        {type === "BUNDLE_PRICE" ? (
          <div>
            <Label htmlFor="of-price">Bundle price (₹)</Label>
            <Input id="of-price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={FIELD} />
            <FieldError errors={errors.pricePaise} />
          </div>
        ) : (
          <div>
            <Label htmlFor="of-percent">Percent off</Label>
            <Input id="of-percent" value={percent} onChange={(e) => setPercent(e.target.value)} inputMode="numeric" className={FIELD} />
            <FieldError errors={errors.percent} />
          </div>
        )}
      </div>

      <div>
        <Label htmlFor="of-scope">Applies to</Label>
        <select id="of-scope" value={collectionId} onChange={(e) => setCollectionId(e.target.value)} className={NATIVE}>
          <option value="">All products</option>
          {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <FieldError errors={errors.collectionId} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="of-starts">Starts</Label>
          <input id="of-starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={NATIVE} />
          <FieldError errors={errors.startsAt} />
        </div>
        <div>
          <Label htmlFor="of-ends">Ends</Label>
          <input id="of-ends" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={NATIVE} />
          <FieldError errors={errors.endsAt} />
        </div>
        <p className="-mt-2 text-xs text-text-muted sm:col-span-2">Leave both blank to run it until you switch it off.</p>
      </div>

      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-5 accent-brand" />
        Active (applies at checkout)
      </label>

      {preview && (
        <p className="rounded-md bg-bg p-3 text-sm" aria-live="polite" data-testid="offer-preview">
          {preview}{scope ? ` in ${scope}` : ""}
        </p>
      )}

      <Button type="submit" disabled={pending} className="h-11 w-full px-6 sm:w-auto" data-testid="save-offer">{pending ? "Saving…" : offer ? "Save changes" : "Create offer"}</Button>
    </form>
  );
}
