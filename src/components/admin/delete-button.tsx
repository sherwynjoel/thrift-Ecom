"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import type { ActionResult } from "@/server/action-result";

const GENERIC_ERROR = "Something went wrong. Please try again.";

/** Confirm-then-delete for simple admin records (coupons, offers). */
export function DeleteButton({ label, confirmText, onConfirm, redirectTo }: {
  label: string;
  confirmText: string;
  onConfirm: () => Promise<ActionResult<null>>;
  redirectTo: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const confirm = () =>
    start(async () => {
      try {
        const r = await onConfirm();
        if (!r.ok) {
          toast.error(r.message);
          setOpen(false);
          return;
        }
        toast.success("Deleted");
        router.push(redirectTo);
        router.refresh();
      } catch {
        toast.error(GENERIC_ERROR);
        setOpen(false);
      }
    });

  return (
    <>
      <Button type="button" variant="destructive" className="h-11 px-4" onClick={() => setOpen(true)} data-testid="delete-button">{label}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-bg">
          <DialogTitle>{label}?</DialogTitle>
          <DialogDescription>{confirmText}</DialogDescription>
          <DialogFooter>
            <Button type="button" variant="secondary" className="h-11 px-4" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" variant="destructive" className="h-11 px-4" onClick={confirm} disabled={pending} data-testid="confirm-delete">{pending ? "Deleting…" : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
