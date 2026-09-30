"use client";

import type { OrderStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveTrackingAction } from "@/app/admin/orders/actions";
import { FieldError } from "@/components/admin/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CARRIERS, carrierById, carrierIdByName, trackingUrlFor, type CarrierId } from "@/lib/carriers";
import { isHttpUrl } from "@/lib/url";
import { fulfilmentRank, isPaidStatus } from "@/lib/order-status";

const GENERIC_ERROR = "Something went wrong. Please try again.";

type Props = { orderId: string; status: OrderStatus; carrier: string | null; trackingNumber: string | null; trackingUrl: string | null };

export function TrackingForm({ orderId, status, carrier, trackingNumber, trackingUrl }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const initialCarrier: CarrierId = carrierIdByName(carrier) ?? "delhivery";
  const [carrierId, setCarrierId] = useState<CarrierId>(initialCarrier);
  const [number, setNumber] = useState(trackingNumber ?? "");
  // Only a saved link that the carrier template would not have produced is a custom one.
  const savedCustom = trackingUrl && trackingNumber && trackingUrl !== trackingUrlFor(initialCarrier, trackingNumber) ? trackingUrl : "";
  const [customUrl, setCustomUrl] = useState(savedCustom);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  if (!isPaidStatus(status)) return null;
  const canShip = fulfilmentRank(status) < fulfilmentRank("SHIPPED");
  const needsLink = !carrierById(carrierId)?.trackingUrl;
  const preview = number.trim() ? trackingUrlFor(carrierId, number.trim(), needsLink ? customUrl.trim() : null) : null;

  const save = (markShipped: boolean) =>
    start(async () => {
      try {
        const r = await saveTrackingAction(orderId, { carrier: carrierId, trackingNumber: number, trackingUrl: needsLink ? customUrl : null }, markShipped);
        if (!r.ok) {
          setErrors(r.fieldErrors ?? {});
          toast.error(r.message);
          return;
        }
        setErrors({});
        toast.success(markShipped ? "Marked shipped; customer emailed" : "Tracking saved");
        router.refresh();
      } catch {
        toast.error(GENERIC_ERROR);
      }
    });

  return (
    <form
      className="space-y-4 rounded-md border border-border bg-surface p-4"
      data-testid="tracking-form"
      onSubmit={(e) => {
        e.preventDefault();
        save(canShip);
      }}
    >
      <h2 className="text-2xl">Tracking</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="carrier">Carrier</Label>
          <select
            id="carrier"
            value={carrierId}
            onChange={(e) => setCarrierId(e.target.value as CarrierId)}
            className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3 text-base md:text-sm"
            aria-invalid={errors.carrier ? true : undefined}
          >
            {CARRIERS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <FieldError errors={errors.carrier} />
        </div>
        <div>
          <Label htmlFor="tracking-number">Tracking number</Label>
          <Input
            id="tracking-number"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className="mt-1 h-11 font-mono"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="done"
            aria-invalid={errors.trackingNumber ? true : undefined}
            aria-describedby="tracking-preview"
          />
          <FieldError errors={errors.trackingNumber} />
        </div>
      </div>
      {needsLink && (
        <div>
          <Label htmlFor="tracking-url">Tracking link (optional)</Label>
          <Input
            id="tracking-url"
            type="url"
            inputMode="url"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            className="mt-1 h-11"
            placeholder="https://"
            autoComplete="off"
            aria-invalid={errors.trackingUrl ? true : undefined}
          />
          <FieldError errors={errors.trackingUrl} />
        </div>
      )}
      <p id="tracking-preview" className="break-all text-xs text-text-muted" aria-live="polite">
        {preview && isHttpUrl(preview) ? (
          <>Customer link: <a href={preview} target="_blank" rel="noopener noreferrer" className="underline">{preview}</a></>
        ) : number.trim() ? "No tracking link for this carrier; the customer sees the number only." : "The customer gets this in the shipped email."}
      </p>
      <div className="flex flex-wrap gap-2">
        {canShip && (
          <Button type="submit" className="h-11 px-4" disabled={pending} data-testid="save-and-ship">
            {pending ? "Saving…" : "Save & mark shipped"}
          </Button>
        )}
        <Button type="button" variant={canShip ? "secondary" : "default"} className="h-11 px-4" disabled={pending} onClick={() => save(false)} data-testid="save-tracking">
          Save tracking
        </Button>
      </div>
    </form>
  );
}
