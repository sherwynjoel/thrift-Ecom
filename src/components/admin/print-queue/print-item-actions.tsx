"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { holdItemAction, markPrintedAction, releaseHoldAction } from "@/app/admin/print-queue/actions";
import { FieldError } from "@/components/admin/field-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { BRAND } from "@/config/brand";
import { printHoldWhatsappText, whatsappLink } from "@/lib/contact-links";
import { formatDateTimeIst } from "@/lib/dates";
import type { DesignSide } from "@/lib/studio/constants";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const LINK_BUTTON = "min-h-11 inline-flex items-center";

export interface PrintItemActionsProps {
  itemId: string; orderNumber: string; customerName: string; customerPhone: string;
  hasFront: boolean; hasBack: boolean; printedAt: Date | null; heldAt: Date | null; holdNote: string | null;
  /** False outside the print queue's statuses (order page): only the downloads and the printed line show. */
  actionable?: boolean;
}

const fileUrl = (itemId: string, side: DesignSide) => `/admin/print-queue/files/${encodeURIComponent(itemId)}/${side}`;

export function PrintItemActions(p: PrintItemActionsProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [holdOpen, setHoldOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string[] | undefined>();
  const sides = ([p.hasFront && "front", p.hasBack && "back"] as const).filter((s): s is DesignSide => Boolean(s));
  const actionable = p.actionable ?? true;

  // One temporary <a download> per side, 300 ms apart (browsers drop rapid back-to-back downloads). No ZIP.
  const downloadAll = () => {
    sides.forEach((side, i) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = fileUrl(p.itemId, side);
        a.download = "";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 300);
    });
  };

  const run = (fn: () => Promise<{ ok: true; message: string } | { ok: false }>) =>
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) {
          toast.success(r.message);
          router.refresh();
        }
      } catch {
        toast.error(GENERIC_ERROR);
      }
    });

  const markPrinted = () =>
    run(async () => {
      const r = await markPrintedAction(p.itemId);
      if (!r.ok) {
        toast.error(r.message);
        return { ok: false };
      }
      return { ok: true, message: r.data.orderMovedToProcessing ? `Marked printed · order ${p.orderNumber} moved to Processing` : "Marked printed" };
    });

  const hold = () =>
    run(async () => {
      const r = await holdItemAction(p.itemId, note);
      if (!r.ok) {
        setNoteError(r.fieldErrors?.note);
        toast.error(r.fieldErrors?.note ? "Add a note for the hold" : r.message);
        if (!r.fieldErrors?.note) setHoldOpen(false);
        return { ok: false };
      }
      setHoldOpen(false);
      setNote("");
      return { ok: true, message: "On hold · order flagged" };
    });

  const release = () =>
    run(async () => {
      const r = await releaseHoldAction(p.itemId);
      if (!r.ok) {
        toast.error(r.message);
        return { ok: false };
      }
      return { ok: true, message: "Hold released" };
    });

  return (
    <div className="space-y-2" data-testid="print-item-actions">
      <div className="flex flex-wrap gap-2">
        {sides.map((side) => (
          <Button
            key={side}
            variant="secondary"
            className={LINK_BUTTON}
            render={<a href={fileUrl(p.itemId, side)} download data-testid={`print-download-${side}`} />}
            nativeButton={false}
          >
            Download {side}
          </Button>
        ))}
        {sides.length === 2 && (
          <Button type="button" variant="secondary" className="h-11" onClick={downloadAll} data-testid="print-download-all">
            Download all
          </Button>
        )}
      </div>

      {p.printedAt ? (
        <p className="text-sm font-medium text-green-400" data-testid="printed-at">Printed {formatDateTimeIst(p.printedAt)}</p>
      ) : !actionable ? null : p.heldAt ? (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200" data-testid="hold-box">
          <p className="break-words"><span className="font-medium">On hold: </span>{p.holdNote}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" className="h-11" onClick={release} disabled={pending} data-testid="release-hold">
              Release hold
            </Button>
            <Button
              variant="secondary"
              className={LINK_BUTTON}
              render={
                <a
                  href={whatsappLink(p.customerPhone, printHoldWhatsappText({ number: p.orderNumber, name: p.customerName, brand: BRAND.name }))}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="hold-whatsapp"
                />
              }
              nativeButton={false}
            >
              <MessageCircle className="size-4" /> Message on WhatsApp
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="h-11 px-5" onClick={markPrinted} disabled={pending} data-testid="mark-printed">
            Mark printed
          </Button>
          <Button type="button" variant="secondary" className="h-11" onClick={() => { setNoteError(undefined); setHoldOpen(true); }} disabled={pending} data-testid="hold-item">
            Hold
          </Button>
        </div>
      )}

      <Dialog open={holdOpen} onOpenChange={setHoldOpen}>
        <DialogContent className="bg-bg">
          <DialogTitle>Hold this print</DialogTitle>
          <DialogDescription>The order is flagged for attention until you resolve it on the order page.</DialogDescription>
          <div>
            <Label htmlFor="hold-note">Why? (the customer does not see this)</Label>
            <textarea
              id="hold-note"
              rows={3}
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-invalid={noteError ? true : undefined}
              className="mt-1 w-full rounded-md border border-border bg-bg p-3 text-base md:text-sm"
            />
            <FieldError errors={noteError} />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" className="h-11 px-4" onClick={() => setHoldOpen(false)}>Cancel</Button>
            <Button type="button" className="h-11 px-4" onClick={hold} disabled={pending} data-testid="confirm-hold">
              {pending ? "Holding…" : "Hold item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
