"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { placeOrderAction, quoteCheckoutAction } from "@/app/(storefront)/checkout/actions";
import { AddressForm } from "@/components/storefront/account/address-form";
import { PriceBreakup } from "@/components/storefront/price-breakup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addressLines, formatPhone } from "@/lib/address-format";
import { MAX_ADDRESSES } from "@/lib/address-limits";
import { formatPaise } from "@/lib/money";
import { discountLabel, type PriceResult } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { ProviderName } from "@/server/payments";
import type { AddressView } from "@/server/services/addresses";
import type { CheckoutView } from "@/server/services/checkout";
import { orderStatusUrl, startPayment } from "./pay";

const NOTE_MAX = 300;
const COLLAPSED_LINES = 2;

function initialAddressId(addresses: AddressView[]): string | null {
  return (addresses.find((a) => a.isDefault) ?? addresses[0])?.id ?? null;
}

function DiscountNotice({ price, appliedCode }: { price: PriceResult; appliedCode: string | null }) {
  let text: string | null = null;
  if (appliedCode && price.applied === "offer" && price.offer && price.coupon) {
    text = `Your code ${appliedCode} saves ${formatPaise(price.coupon.discountPaise)}, but the “${price.offer.label}” offer saves more, so we applied the offer.`;
  } else if (price.applied === "offer" && price.offer) {
    text = `Offer applied: ${price.offer.label} (−${formatPaise(price.offer.discountPaise)})`;
  } else if (price.applied === "coupon" && price.coupon) {
    text = `Code ${price.coupon.code} applied (−${formatPaise(price.coupon.discountPaise)})`;
  }
  return (
    <p data-testid="discount-notice" aria-live="polite" className={cn("text-sm", text && "rounded-md bg-surface p-3 text-brand")}>
      {text}
    </p>
  );
}

export function CheckoutForm({ view, provider }: { view: CheckoutView; provider: ProviderName }) {
  const router = useRouter();
  const [addresses, setAddresses] = useState<AddressView[]>(view.addresses);
  const [selectedId, setSelectedId] = useState<string | null>(() => initialAddressId(view.addresses));
  const [adding, setAdding] = useState(view.addresses.length === 0);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [price, setPrice] = useState<PriceResult>(view.price);
  const [note, setNote] = useState("");
  const [showAllLines, setShowAllLines] = useState(false);
  const [couponPending, startCoupon] = useTransition();
  const [paying, startPay] = useTransition();
  const pending = couponPending || paying;
  const couponInputRef = useRef<HTMLInputElement>(null);
  const focusCouponInput = useRef(false);

  // After "Remove" the chip (and its focused button) unmounts; hand focus to the code input instead.
  useEffect(() => {
    if (appliedCode === null && focusCouponInput.current) {
      focusCouponInput.current = false;
      couponInputRef.current?.focus();
    }
  }, [appliedCode]);

  const itemCount = view.lines.reduce((s, l) => s + l.quantity, 0);
  const shippingGap = view.freeShippingThresholdPaise - (price.subtotalPaise - price.discountPaise);

  function applyCoupon(e?: React.FormEvent) {
    e?.preventDefault();
    const code = couponInput.trim();
    if (!code) {
      setCouponError("Enter a code");
      return;
    }
    startCoupon(async () => {
      const r = await quoteCheckoutAction(code);
      if (!r.ok) {
        setCouponError(r.message);
        return;
      }
      setPrice(r.data);
      if (r.data.couponError) {
        setCouponError(r.data.couponError);
        setAppliedCode(null);
      } else {
        setCouponError(null);
        setAppliedCode(code.toUpperCase());
      }
    });
  }

  function removeCoupon() {
    startCoupon(async () => {
      const r = await quoteCheckoutAction(null);
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      setPrice(r.data);
      focusCouponInput.current = true;
      setAppliedCode(null);
      setCouponError(null);
      setCouponInput("");
    });
  }

  function pay() {
    if (!selectedId) return;
    startPay(async () => {
      const r = await placeOrderAction({ addressId: selectedId, couponCode: appliedCode, customerNote: note });
      if (!r.ok) {
        toast.error(r.message);
        const couponRefused = r.fieldErrors?.couponCode;
        if (couponRefused) {
          // The code was refused at Pay time (e.g. it just hit its usage limit): drop it, so the
          // summary and the Pay button never show a discount the order won't get.
          setAppliedCode(null);
          setCouponInput("");
          setCouponError(couponRefused[0]);
        }
        // Re-quote after any failed Pay, with the code still applied (or none once it was refused):
        // an offer or the shipping threshold can change without the lines changing, and then the
        // form is not remounted by the refresh below and would keep showing a stale total (m3).
        const code = couponRefused ? null : appliedCode;
        const fresh = await quoteCheckoutAction(code);
        if (fresh.ok) {
          setPrice(fresh.data);
          if (code && fresh.data.couponError) {
            setAppliedCode(null);
            setCouponError(fresh.data.couponError);
          }
        }
        // A stock-driven line change changes the page's form key and remounts the form with the server's view.
        router.refresh();
        return;
      }
      try {
        await startPayment(r.data, router);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not open the payment window");
        router.push(orderStatusUrl(r.data.number, "dismissed"));
      }
    });
  }

  const payHint = !selectedId
    ? "Choose or add a delivery address"
    : adding
      ? "Save or cancel the new address to continue"
      : null;

  return (
    <div className="container-x grid gap-8 pb-8 pt-6 lg:grid-cols-[1fr_380px] lg:gap-12 lg:pb-12" data-testid="checkout-page">
      <h1 className="text-4xl md:text-6xl lg:col-span-2">Checkout</h1>

      <div className="min-w-0 space-y-10">
        {view.stockIssues.length > 0 && (
          <div role="status" className="rounded-md border border-border bg-surface p-4 text-sm" data-testid="stock-issues">
            <p className="font-medium">Some items changed while you were shopping</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-text-muted">
              {view.stockIssues.map((i) => (
                <li key={i.variantId}>
                  {i.name}: {i.available === 0 ? "sold out, removed from your bag" : `only ${i.available} left, we updated your bag`}
                </li>
              ))}
            </ul>
          </div>
        )}

        <fieldset className="min-w-0 space-y-3">
          <legend className="mb-3 font-display text-2xl uppercase">Deliver to</legend>
          {addresses.map((a) => (
            <label
              key={a.id}
              data-testid="address-option"
              className="flex min-h-11 cursor-pointer gap-3 rounded-md border border-border p-4 has-[:checked]:border-brand has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <input
                type="radio"
                name="address"
                value={a.id}
                className="mt-1 size-5 shrink-0 accent-brand"
                checked={selectedId === a.id}
                onChange={() => setSelectedId(a.id)}
              />
              <span className="min-w-0 break-words text-sm">
                <span className="block font-medium">
                  {a.fullName}
                  {a.isDefault && <span className="ml-2 text-xs font-normal text-text-muted">Default</span>}
                </span>
                {addressLines(a).map((line) => <span key={line} className="block text-text-muted">{line}</span>)}
                <span className="block text-text-muted">{formatPhone(a.phone)}</span>
              </span>
            </label>
          ))}

          {adding ? (
            <div className="rounded-md border border-border p-4">
              <p className="mb-4 font-medium">New address</p>
              <AddressForm
                forceDefault={addresses.length === 0}
                onSaved={(a) => {
                  setAddresses((l) => [a, ...l.map((x) => (a.isDefault ? { ...x, isDefault: false } : x))]);
                  setSelectedId(a.id);
                  setAdding(false);
                }}
                onCancel={addresses.length ? () => setAdding(false) : undefined}
              />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {addresses.length < MAX_ADDRESSES ? (
                <Button type="button" variant="secondary" className="h-11" onClick={() => setAdding(true)}>Add a new address</Button>
              ) : (
                <p className="text-sm text-text-muted">You have saved the maximum of {MAX_ADDRESSES} addresses.</p>
              )}
              <Link href="/account/addresses" className="inline-flex min-h-11 items-center text-sm text-text-muted underline-offset-4 hover:underline">
                Manage addresses
              </Link>
            </div>
          )}
        </fieldset>

        <section aria-labelledby="bag-heading" className="min-w-0">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="bag-heading" className="font-display text-2xl uppercase">Your bag ({itemCount})</h2>
            <Link href="/cart" className="inline-flex min-h-11 items-center text-sm text-text-muted underline-offset-4 hover:underline">Edit bag</Link>
          </div>
          <ul id="checkout-lines" className="mt-2 divide-y divide-border" data-testid="checkout-lines">
            {view.lines.map((l, i) => (
              <li
                key={l.variantId}
                className={cn("flex gap-3 py-3", i >= COLLAPSED_LINES && !showAllLines && "hidden lg:flex")}
                data-testid="checkout-line"
              >
                <div className="relative aspect-[4/5] w-14 shrink-0 overflow-hidden rounded-sm bg-surface">
                  {l.imageUrl && <Image src={l.imageUrl} alt={l.productName} fill sizes="56px" className="object-cover" />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="line-clamp-2 text-sm font-medium">{l.productName}</p>
                  <p className="text-xs text-text-muted">{l.colorName} / {l.size} × {l.quantity}</p>
                </div>
                <p className="shrink-0 font-display text-lg">{formatPaise(l.lineTotalPaise)}</p>
              </li>
            ))}
          </ul>
          {view.lines.length > COLLAPSED_LINES && (
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full lg:hidden"
              aria-expanded={showAllLines}
              aria-controls="checkout-lines"
              onClick={() => setShowAllLines((v) => !v)}
            >
              {showAllLines ? "Show fewer items" : `Show all ${view.lines.length} items`}
            </Button>
          )}
        </section>

        <section aria-labelledby="coupon-heading" className="min-w-0 space-y-3">
          <h2 id="coupon-heading" className="font-display text-2xl uppercase">Offers</h2>
          {appliedCode ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-brand p-2 pl-4" data-testid="coupon-applied">
              <span className="min-w-0 truncate text-sm"><span className="font-medium">{appliedCode}</span> applied</span>
              <Button type="button" variant="ghost" className="h-11" onClick={removeCoupon} disabled={pending} aria-label={`Remove code ${appliedCode}`}>
                Remove
              </Button>
            </div>
          ) : (
            <form onSubmit={applyCoupon} noValidate>
              <Label htmlFor="coupon">Coupon code</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  ref={couponInputRef}
                  id="coupon"
                  name="coupon"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  className="h-11 min-w-0 flex-1 bg-bg uppercase"
                  autoCapitalize="characters"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  maxLength={40}
                  aria-describedby="coupon-msg"
                  aria-invalid={Boolean(couponError)}
                />
                <Button type="submit" variant="secondary" className="h-11 px-5" disabled={pending}>Apply</Button>
              </div>
            </form>
          )}
          <p id="coupon-msg" role="alert" className="min-h-5 text-sm text-danger" data-testid="coupon-error">
            {couponError}
          </p>
          <DiscountNotice price={price} appliedCode={appliedCode} />
        </section>

        <section className="min-w-0">
          <Label htmlFor="note">Note for us (optional)</Label>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={NOTE_MAX}
            rows={3}
            aria-describedby="note-count"
            className="mt-1 w-full rounded-md border border-input bg-bg p-3 text-base"
          />
          <p id="note-count" className="text-right text-xs text-text-muted">{note.length}/{NOTE_MAX}</p>
        </section>
      </div>

      <aside className="h-fit space-y-4 rounded-md border border-border bg-surface p-5 lg:sticky lg:top-24" aria-label="Order summary">
        <p className="font-display text-2xl uppercase">Summary</p>
        <PriceBreakup
          subtotalPaise={price.subtotalPaise}
          discountPaise={price.discountPaise}
          discountLabel={discountLabel(price)}
          shippingPaise={price.shippingPaise}
          totalPaise={price.totalPaise}
        />
        {price.shippingPaise > 0 && shippingGap > 0 && (
          <p className="text-sm text-text-muted" data-testid="free-shipping-hint">Add {formatPaise(shippingGap)} more for free delivery</p>
        )}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none" data-testid="pay-bar" data-sticky-bar>
          <div className="flex items-center gap-4">
            <div className="flex shrink-0 flex-col leading-tight lg:hidden">
              <span className="text-xs text-text-muted">Total</span>
              <span className="font-display text-xl" data-testid="pay-bar-total">{formatPaise(price.totalPaise)}</span>
            </div>
            <Button
              type="button"
              data-testid="pay-button"
              size="lg"
              className="h-12 min-w-0 flex-1 font-display text-lg tracking-wide"
              disabled={pending || !selectedId || adding}
              aria-describedby={payHint ? "pay-hint" : undefined}
              onClick={pay}
            >
              {paying ? "Starting payment…" : `Pay ${formatPaise(price.totalPaise)}`}
            </Button>
          </div>
          {payHint && <p id="pay-hint" className="mt-1 text-center text-xs text-danger">{payHint}</p>}
          <p className="mt-1 text-center text-xs text-text-muted">
            {provider === "mock" ? "Test mode: no real money moves." : "Secure payment by Razorpay: UPI, cards, netbanking, wallets."}
          </p>
        </div>
      </aside>
    </div>
  );
}
