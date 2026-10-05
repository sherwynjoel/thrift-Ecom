"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveBannerAction } from "@/app/admin/banners/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/form-parse";
import type { BannerInput } from "@/lib/validation/banner";
import type { AdminBannerRow } from "@/server/services/banners";
import { FieldError } from "./field-error";
import { RadioCards } from "./radio-cards";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const FIELD = "mt-1 h-11 bg-bg";
const DATE = "mt-1 h-11 w-full min-w-0 rounded-md border border-border bg-bg px-3 text-sm";
type Placement = BannerInput["placement"];

export function BannerForm({ banner }: { banner: AdminBannerRow | null }) {
  const [v, setV] = useState({
    placement: (banner?.placement ?? "HERO") as Placement,
    title: banner?.title ?? "",
    subtitle: banner?.subtitle ?? "",
    ctaLabel: banner?.ctaLabel ?? "",
    ctaHref: banner?.ctaHref ?? "",
    startsAt: "",
    endsAt: "",
    active: banner?.active ?? false,
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV((p) => ({ ...p, [k]: value }));
  const text = (k: "title" | "subtitle" | "ctaLabel" | "ctaHref") => (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value);
  const hero = v.placement === "HERO";
  const needsImage = hero && !banner?.imageUrl;

  // datetime-local is in the browser's zone, so fill it after mount (the server render can't know that zone).
  useEffect(() => {
    setV((p) => ({ ...p, startsAt: toDateTimeLocal(banner?.startsAt ?? null), endsAt: toDateTimeLocal(banner?.endsAt ?? null) }));
  }, [banner?.startsAt, banner?.endsAt]);

  const save = () => {
    const startsAt = fromDateTimeLocal(v.startsAt);
    const endsAt = fromDateTimeLocal(v.endsAt);
    if (startsAt === undefined || endsAt === undefined) {
      setErrors({ ...(startsAt === undefined && { startsAt: ["Enter a valid date"] }), ...(endsAt === undefined && { endsAt: ["Enter a valid date"] }) });
      return void toast.error("Fix the highlighted fields");
    }
    const input: BannerInput = { ...v, active: needsImage ? false : v.active, startsAt, endsAt };
    start(async () => {
      try {
        const r = await saveBannerAction(banner?.id ?? null, input);
        if (!r.ok) {
          setErrors(r.fieldErrors ?? {});
          toast.error(r.message === "Invalid input" ? "Fix the highlighted fields" : r.message);
          return;
        }
        setErrors({});
        if (banner) {
          toast.success("Banner saved");
          router.refresh();
        } else {
          toast.success(hero ? "Slide created. Upload an image to switch it on." : "Ticker line created");
          router.push(`/admin/banners/${r.data.id}`);
        }
      } catch {
        toast.error(GENERIC_ERROR);
      }
    });
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="max-w-3xl space-y-5 rounded-md border border-border bg-surface p-4 sm:p-5" data-testid="banner-form" noValidate>
      <RadioCards legend="Placement" name="b-placement" value={v.placement} onChange={(p) => set("placement", p)} options={[{ value: "HERO", label: "Hero slide (image)" }, { value: "STRIP", label: "Ticker line (text)" }]} />

      <div>
        <Label htmlFor="b-title">Title</Label>
        <Input id="b-title" value={v.title} onChange={text("title")} maxLength={80} className={FIELD} aria-describedby="b-title-hint" />
        <p id="b-title-hint" className="mt-1 text-xs text-text-muted">{hero ? "Big headline on the slide" : "The ticker text"}</p>
        <FieldError errors={errors.title} />
      </div>

      {hero && (
        <>
          <div>
            <Label htmlFor="b-subtitle">Subtitle (optional)</Label>
            <Input id="b-subtitle" value={v.subtitle} onChange={text("subtitle")} maxLength={160} className={FIELD} />
            <FieldError errors={errors.subtitle} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="b-cta-label">Button label (optional)</Label>
              <Input id="b-cta-label" value={v.ctaLabel} onChange={text("ctaLabel")} maxLength={30} className={FIELD} />
              <FieldError errors={errors.ctaLabel} />
            </div>
            <div>
              <Label htmlFor="b-cta-href">Button link</Label>
              <Input id="b-cta-href" value={v.ctaHref} onChange={text("ctaHref")} inputMode="url" placeholder="/collections/new-drops" autoCapitalize="none" spellCheck={false} className={FIELD} />
              <FieldError errors={errors.ctaHref} />
            </div>
          </div>
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="b-starts">Starts (optional)</Label>
          <input id="b-starts" type="datetime-local" value={v.startsAt} onChange={(e) => set("startsAt", e.target.value)} className={DATE} />
          <FieldError errors={errors.startsAt} />
        </div>
        <div>
          <Label htmlFor="b-ends">Ends (optional)</Label>
          <input id="b-ends" type="datetime-local" value={v.endsAt} onChange={(e) => set("endsAt", e.target.value)} className={DATE} />
          <FieldError errors={errors.endsAt} />
        </div>
        <p className="-mt-2 text-xs text-text-muted sm:col-span-2">Leave both blank to show it until you switch it off. Times are in your device&apos;s time zone; lists show IST.</p>
      </div>

      <div>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={needsImage ? false : v.active} disabled={needsImage} onChange={(e) => set("active", e.target.checked)} className="size-5 accent-brand" aria-describedby={needsImage ? "b-active-hint" : undefined} data-testid="banner-active" />
          Show on the site
        </label>
        {needsImage && <p id="b-active-hint" className="text-xs text-text-muted">Upload a desktop image first</p>}
        <FieldError errors={errors.active} />
      </div>

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-bg p-4 pb-safe sm:static sm:m-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button type="submit" disabled={pending} className="h-11 w-full px-6 sm:w-auto" data-testid="save-banner">{pending ? "Saving…" : "Save banner"}</Button>
      </div>
    </form>
  );
}
