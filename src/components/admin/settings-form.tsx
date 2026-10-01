"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveSettingsAction } from "@/app/admin/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseIntField, parseRupeesField } from "@/lib/form-parse";
import { INDIA_STATES } from "@/lib/india-states";
import { paiseToRupees } from "@/lib/money";
import type { SettingsInput } from "@/lib/validation/settings";
import type { StoreSettings } from "@/server/services/settings";
import { FieldError } from "./field-error";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const FIELD = "mt-1 h-11 bg-bg";
const FIELDSET = "space-y-4 rounded-md border border-border bg-surface p-4 sm:p-5";
const LEGEND = "px-1 font-display text-2xl uppercase";

type Text = {
  shippingFee: string; freeShippingThreshold: string; lowStockThreshold: string; adminNotifyEmail: string; whatsappNumber: string;
  sellerName: string; sellerAddress: string; sellerState: string; gstin: string; gstRateLowPct: string; gstRateHighPct: string; gstThreshold: string;
  customFrontFee: string; customBackFee: string; announcementText: string; announcementHref: string;
};

function fromSettings(s: StoreSettings): Text {
  return {
    shippingFee: paiseToRupees(s.shippingFeePaise), freeShippingThreshold: paiseToRupees(s.freeShippingThresholdPaise),
    lowStockThreshold: String(s.lowStockThreshold), adminNotifyEmail: s.adminNotifyEmail ?? "", whatsappNumber: s.whatsappNumber ?? "",
    sellerName: s.sellerName, sellerAddress: s.sellerAddress, sellerState: s.sellerState, gstin: s.gstin ?? "",
    gstRateLowPct: String(s.gstRateLowPct), gstRateHighPct: String(s.gstRateHighPct), gstThreshold: paiseToRupees(s.gstThresholdPaise),
    customFrontFee: paiseToRupees(s.customFrontFeePaise), customBackFee: paiseToRupees(s.customBackFeePaise),
    announcementText: s.announcementText ?? "", announcementHref: s.announcementHref ?? "",
  };
}

export function SettingsForm({ settings }: { settings: StoreSettings }) {
  const [t, setT] = useState<Text>(() => fromSettings(settings));
  const [dailySummaryEnabled, setDaily] = useState(settings.dailySummaryEnabled);
  const [abandonedCartEnabled, setAbandoned] = useState(settings.abandonedCartEnabled);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: keyof Text) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setT((p) => ({ ...p, [k]: e.target.value }));
  const missingBusiness = !settings.sellerAddress.trim() || !settings.sellerState;

  const save = () => {
    const local: Record<string, string[]> = {};
    const rupees = (text: string, key: string) => {
      const v = parseRupeesField(text, { optional: false });
      if (v === undefined || v === null) local[key] = ["Enter an amount in rupees"];
      return v ?? 0;
    };
    const whole = (text: string, key: string) => {
      const v = parseIntField(text, { optional: false });
      if (v === undefined || v === null) local[key] = ["Enter a whole number"];
      return v ?? 0;
    };
    const input: SettingsInput = {
      shippingFeePaise: rupees(t.shippingFee, "shippingFeePaise"),
      freeShippingThresholdPaise: rupees(t.freeShippingThreshold, "freeShippingThresholdPaise"),
      lowStockThreshold: whole(t.lowStockThreshold, "lowStockThreshold"),
      adminNotifyEmail: t.adminNotifyEmail,
      sellerName: t.sellerName,
      sellerAddress: t.sellerAddress,
      sellerState: t.sellerState as SettingsInput["sellerState"],
      gstin: t.gstin,
      gstRateLowPct: whole(t.gstRateLowPct, "gstRateLowPct"),
      gstRateHighPct: whole(t.gstRateHighPct, "gstRateHighPct"),
      gstThresholdPaise: rupees(t.gstThreshold, "gstThresholdPaise"),
      whatsappNumber: t.whatsappNumber,
      customFrontFeePaise: rupees(t.customFrontFee, "customFrontFeePaise"),
      customBackFeePaise: rupees(t.customBackFee, "customBackFeePaise"),
      announcementText: t.announcementText,
      announcementHref: t.announcementHref,
      dailySummaryEnabled,
      abandonedCartEnabled,
    };
    if (Object.keys(local).length) {
      setErrors(local);
      toast.error("Fix the highlighted fields");
      return;
    }
    start(async () => {
      try {
        const r = await saveSettingsAction(input);
        if (!r.ok) {
          setErrors(r.fieldErrors ?? {});
          toast.error(r.message === "Invalid input" ? "Fix the highlighted fields" : r.message);
          return;
        }
        setErrors({});
        toast.success("Settings saved");
        router.refresh();
      } catch {
        toast.error(GENERIC_ERROR);
      }
    });
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="max-w-3xl space-y-6" data-testid="settings-form" noValidate>
      {missingBusiness && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200" role="status" data-testid="settings-notice">
          Add your business address and state; they print on labels and invoices.
        </p>
      )}

      <fieldset className={FIELDSET}>
        <legend className={LEGEND}>Shipping</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="s-fee">Shipping fee (₹)</Label>
            <Input id="s-fee" value={t.shippingFee} onChange={set("shippingFee")} inputMode="decimal" className={FIELD} />
            <FieldError errors={errors.shippingFeePaise} />
          </div>
          <div>
            <Label htmlFor="s-free">Free shipping from (₹)</Label>
            <Input id="s-free" value={t.freeShippingThreshold} onChange={set("freeShippingThreshold")} inputMode="decimal" className={FIELD} />
            <FieldError errors={errors.freeShippingThresholdPaise} />
          </div>
        </div>
      </fieldset>

      <fieldset className={FIELDSET}>
        <legend className={LEGEND}>Custom prints</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="s-front-fee">Front print fee (₹)</Label>
            <Input id="s-front-fee" value={t.customFrontFee} onChange={set("customFrontFee")} inputMode="decimal" className={FIELD} aria-describedby="s-print-fee-hint" />
            <FieldError errors={errors.customFrontFeePaise} />
          </div>
          <div>
            <Label htmlFor="s-back-fee">Back print fee (₹)</Label>
            <Input id="s-back-fee" value={t.customBackFee} onChange={set("customBackFee")} inputMode="decimal" className={FIELD} aria-describedby="s-print-fee-hint" />
            <FieldError errors={errors.customBackFeePaise} />
          </div>
        </div>
        <p id="s-print-fee-hint" className="text-xs text-text-muted">Added to the tee price when that side has a design. 0 = free.</p>
      </fieldset>

      <fieldset className={FIELDSET}>
        <legend className={LEGEND}>Stock</legend>
        <div className="sm:max-w-xs">
          <Label htmlFor="s-low">Low-stock threshold</Label>
          <Input id="s-low" value={t.lowStockThreshold} onChange={set("lowStockThreshold")} inputMode="numeric" className={FIELD} aria-describedby="s-low-hint" />
          <p id="s-low-hint" className="mt-1 text-xs text-text-muted">A variant with this many or fewer counts as low.</p>
          <FieldError errors={errors.lowStockThreshold} />
        </div>
      </fieldset>

      <fieldset className={FIELDSET}>
        <legend className={LEGEND}>Storefront</legend>
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="s-announcement">Announcement text</Label>
            <span className="text-xs text-text-muted" aria-hidden="true">{t.announcementText.length}/140</span>
          </div>
          <Input id="s-announcement" value={t.announcementText} onChange={set("announcementText")} maxLength={140} className={FIELD} aria-describedby="s-announcement-hint" />
          <p id="s-announcement-hint" className="mt-1 text-xs text-text-muted">Shown in a bar above the header on every page. Leave empty to hide it.</p>
          <FieldError errors={errors.announcementText} />
        </div>
        <div>
          <Label htmlFor="s-announcement-href">Announcement link (optional)</Label>
          <Input id="s-announcement-href" value={t.announcementHref} onChange={set("announcementHref")} inputMode="url" placeholder="/collections/new-drops" autoCapitalize="none" spellCheck={false} className={FIELD} />
          <FieldError errors={errors.announcementHref} />
        </div>
      </fieldset>

      <fieldset className={FIELDSET}>
        <legend className={LEGEND}>Notifications</legend>
        <div>
          <Label htmlFor="s-email">Admin email for new orders and alerts</Label>
          <Input id="s-email" type="email" value={t.adminNotifyEmail} onChange={set("adminNotifyEmail")} autoComplete="email" className={FIELD} />
          <FieldError errors={errors.adminNotifyEmail} />
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={dailySummaryEnabled} onChange={(e) => setDaily(e.target.checked)} className="size-5 accent-brand" />
          Send a daily summary at 9 pm
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={abandonedCartEnabled} onChange={(e) => setAbandoned(e.target.checked)} className="size-5 accent-brand" />
          Send abandoned-bag reminders
        </label>
        <div className="sm:max-w-xs">
          <Label htmlFor="s-wa">WhatsApp number</Label>
          <Input id="s-wa" type="tel" value={t.whatsappNumber} onChange={set("whatsappNumber")} inputMode="tel" autoComplete="tel-national" className={FIELD} aria-describedby="s-wa-hint" />
          <p id="s-wa-hint" className="mt-1 text-xs text-text-muted">10 digits. Printed on labels as the seller phone.</p>
          <FieldError errors={errors.whatsappNumber} />
        </div>
      </fieldset>

      <fieldset className={FIELDSET}>
        <legend className={LEGEND}>Business and GST</legend>
        <div>
          <Label htmlFor="s-name">Business name</Label>
          <Input id="s-name" value={t.sellerName} onChange={set("sellerName")} autoComplete="organization" className={FIELD} />
          <FieldError errors={errors.sellerName} />
        </div>
        <div>
          <Label htmlFor="s-address">Business address</Label>
          <textarea id="s-address" value={t.sellerAddress} onChange={set("sellerAddress")} rows={3} autoComplete="street-address" className="mt-1 w-full rounded-md border border-border bg-bg p-3 text-sm" />
          <FieldError errors={errors.sellerAddress} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="s-state">State</Label>
            <select id="s-state" value={t.sellerState} onChange={set("sellerState")} className="mt-1 h-11 w-full min-w-0 rounded-md border border-border bg-bg px-3 text-sm">
              <option value="">Choose…</option>
              {INDIA_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <FieldError errors={errors.sellerState} />
          </div>
          <div>
            <Label htmlFor="s-gstin">GSTIN (optional)</Label>
            <Input id="s-gstin" value={t.gstin} onChange={(e) => setT((p) => ({ ...p, gstin: e.target.value.toUpperCase() }))} autoCapitalize="characters" spellCheck={false} maxLength={15} className={`${FIELD} font-mono uppercase`} />
            <FieldError errors={errors.gstin} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="s-gst-low">GST rate up to the threshold (%)</Label>
            <Input id="s-gst-low" value={t.gstRateLowPct} onChange={set("gstRateLowPct")} inputMode="numeric" className={FIELD} />
            <FieldError errors={errors.gstRateLowPct} />
          </div>
          <div>
            <Label htmlFor="s-gst-high">GST rate above the threshold (%)</Label>
            <Input id="s-gst-high" value={t.gstRateHighPct} onChange={set("gstRateHighPct")} inputMode="numeric" className={FIELD} />
            <FieldError errors={errors.gstRateHighPct} />
          </div>
          <div>
            <Label htmlFor="s-gst-threshold">Threshold unit price (₹)</Label>
            <Input id="s-gst-threshold" value={t.gstThreshold} onChange={set("gstThreshold")} inputMode="decimal" className={FIELD} />
            <FieldError errors={errors.gstThresholdPaise} />
          </div>
        </div>
      </fieldset>

      {/* Fixed to the bottom below lg (like the checkout pay bar) so Save is reachable from any section. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none print:hidden">
        <Button type="submit" disabled={pending} className="h-11 w-full px-6 lg:w-auto" data-testid="save-settings">{pending ? "Saving…" : "Save settings"}</Button>
      </div>
    </form>
  );
}
