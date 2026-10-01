"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useAnimate } from "motion/react";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { addToCartAction } from "@/app/(storefront)/cart/actions";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/config/brand";
import { track } from "@/lib/analytics";
import { MAX_QTY_PER_LINE } from "@/lib/catalog-types";
import { colorsOf, defaultColor, sizesFor } from "@/lib/variant-matrix";
import { formatPaise } from "@/lib/money";
import { formatRating } from "@/lib/rating";
import { onRadioGroupKeyDown, radioTabIndex } from "@/lib/roving-radio";
import { cn } from "@/lib/utils";
import type { ProductDetail } from "@/server/services/catalog";
import { useCartUI } from "./cart-ui";
import { Gallery } from "./gallery";
import { Price } from "./price";
import { RatingStars } from "./reviews/rating-stars";
import { SizeGuide } from "./size-guide";
import { WishlistButton } from "./wishlist-button";

const FIT_LABEL: Record<ProductDetail["fit"], string> = { OVERSIZED: "Oversized fit", REGULAR: "Regular fit", RELAXED: "Relaxed fit" };

export function ProductPurchase({ product, rating }: { product: ProductDetail; rating: { average: number; count: number } | null }) {
  const colors = colorsOf(product.variants);
  const [color, setColor] = useState<string | null>(defaultColor(product.variants));
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [sizeError, setSizeError] = useState(false);
  const [pending, start] = useTransition();
  const [scope, animate] = useAnimate();
  const setOpen = useCartUI((s) => s.setOpen);
  // One visible CTA at a time: the phone sticky bar hides while the main Add to bag button is on screen.
  const ctaRef = useRef<HTMLButtonElement>(null);
  const [ctaOnScreen, setCtaOnScreen] = useState(true);
  useEffect(() => {
    const el = ctaRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setCtaOnScreen(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const sizes = color ? sizesFor(product.variants, color) : [];
  const chosen = sizes.find((s) => s.size === size) ?? null;
  const pricePaise = chosen?.pricePaise ?? product.pricePaise;
  const maxQty = chosen ? Math.min(MAX_QTY_PER_LINE, chosen.stock) : MAX_QTY_PER_LINE;

  const submit = () => {
    if (!chosen) {
      setSizeError(true);
      animate(scope.current, { x: [0, -6, 6, -4, 4, 0] }, { duration: 0.4 });
      return;
    }
    start(async () => {
      const r = await addToCartAction({ variantId: chosen.variantId, quantity: qty });
      if (r.ok) {
        toast.success("Added to your bag");
        setOpen(true);
        track({ name: "add_to_cart", item: { id: product.id, name: product.name, pricePaise, quantity: qty, variant: `${color} / ${chosen.size}` } });
      } else {
        toast.error(r.message);
      }
    });
  };

  const pickColor = (name: string) => {
    setColor(name);
    setSize(null);
    setQty(1);
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
      <Gallery images={product.images} activeColor={color} productName={product.name} />
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-muted">{FIT_LABEL[product.fit]} · {product.fabric}</p>
          <h1 className="mt-2 text-4xl md:text-5xl">{product.name}</h1>
          <div className="mt-3"><Price pricePaise={pricePaise} compareAtPricePaise={product.compareAtPricePaise} size="lg" /></div>
          <p className="text-xs text-text-muted">Inclusive of all taxes</p>
          {rating && (
            <a
              href="#reviews"
              aria-label={`Rated ${formatRating(rating.average)} out of 5, ${rating.count} review${rating.count === 1 ? "" : "s"}`}
              className="inline-flex min-h-11 items-center gap-2 text-sm text-text-muted hover:text-text"
              data-testid="rating-link"
            >
              <span aria-hidden="true" className="inline-flex items-center gap-2">
                <RatingStars rating={rating.average} /> {formatRating(rating.average)} ({rating.count})
              </span>
            </a>
          )}
        </div>

        {colors.length > 0 && (
          <div>
            <p className="mb-2 text-sm">Color: <span className="text-text-muted">{color}</span></p>
            <div className="-ml-1.5 flex flex-wrap gap-1" role="radiogroup" aria-label="Color" onKeyDown={onRadioGroupKeyDown}>
              {colors.map((c, i) => (
                <button key={c.name} type="button" role="radio" aria-checked={c.name === color} tabIndex={radioTabIndex(colors, i, (x) => x.name === color)} onClick={() => pickColor(c.name)} aria-label={c.name} title={c.name} className={cn("size-11 rounded-full border-2 p-1", c.name === color ? "border-brand" : "border-transparent")} data-testid="color-swatch">
                  <span className="block size-full rounded-full border border-border" style={{ backgroundColor: c.hex }} />
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={scope}>
          <div className="mb-2 flex items-center justify-between">
            <p className={cn("text-sm", sizeError && "text-danger")}>{sizeError ? "Pick a size to continue" : "Select size"}</p>
            <SizeGuide fit={product.fit} />
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-6 pb-4" role="radiogroup" aria-label="Size" onKeyDown={onRadioGroupKeyDown}>
            {sizes.map((s, i) => (
              <button key={s.size} type="button" role="radio" aria-checked={s.size === size} tabIndex={radioTabIndex(sizes, i, (x) => x.size === size, (x) => x.stock === 0)} disabled={s.stock === 0} onClick={() => { setSize(s.size); setSizeError(false); setQty(1); }} className={cn("relative min-h-11 min-w-12 rounded-full border px-4 text-sm disabled:cursor-not-allowed disabled:opacity-40", s.size === size ? "border-brand bg-brand text-brand-ink" : "border-border hover:border-text")} data-testid="size-chip">
                {s.size}
                {s.stock > 0 && s.stock < 5 && <span className="absolute -bottom-5 left-0 right-0 text-center text-xs text-danger">{s.stock} left</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <div className="inline-flex items-center rounded-full border border-border">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" className="inline-flex size-11 items-center justify-center"><Minus className="size-4" /></button>
            <span className="min-w-6 text-center" data-testid="qty">{qty}</span>
            <button type="button" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} aria-label="Increase quantity" className="inline-flex size-11 items-center justify-center"><Plus className="size-4" /></button>
          </div>
          <Button ref={ctaRef} size="lg" onClick={submit} disabled={pending || product.soldOut} className="h-11 flex-1 font-display text-lg tracking-wide" data-testid="add-to-cart">
            {product.soldOut ? "Sold out" : pending ? "Adding…" : "Add to bag"}
          </Button>
          <WishlistButton productId={product.id} productName={product.name} className="shrink-0 border border-border" />
        </div>

        {product.isCustomizable && (
          <Button render={<Link href={`/customize/${product.slug}${color ? `?color=${encodeURIComponent(color)}` : ""}`} />} nativeButton={false} variant="secondary" className="h-11 w-full font-display text-lg tracking-wide" data-testid="customize-this">
            Customize this
          </Button>
        )}

        <ul className="grid grid-cols-3 gap-2 text-center text-xs text-text-muted">
          <li className="rounded-sm border border-border p-2">Free delivery over {formatPaise(BRAND.freeShippingThresholdPaise)}</li>
          <li className="rounded-sm border border-border p-2">7-day exchange</li>
          <li className="rounded-sm border border-border p-2">Printed in India</li>
        </ul>
      </div>

      <div
        className={cn("fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-border bg-bg/95 px-4 pt-3 pb-safe backdrop-blur transition-transform duration-200 lg:hidden", ctaOnScreen && "translate-y-full")}
        aria-hidden={ctaOnScreen}
        inert={ctaOnScreen}
        data-testid="sticky-bar"
      >
        <span className="font-display text-xl">{formatPaise(pricePaise)}</span>
        <Button onClick={submit} disabled={pending || product.soldOut} className="h-11 px-5 font-display text-base tracking-wide">{product.soldOut ? "Sold out" : "Add to bag"}</Button>
      </div>
    </div>
  );
}
