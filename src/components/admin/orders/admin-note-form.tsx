"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveAdminNoteAction } from "@/app/admin/orders/actions";
import { FieldError } from "@/components/admin/field-error";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function AdminNoteForm({ orderId, note }: { orderId: string; note: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(note ?? "");
  const [error, setError] = useState<string[] | undefined>();
  const dirty = value.trim() !== (note ?? "").trim();

  const save = () =>
    start(async () => {
      try {
        const r = await saveAdminNoteAction(orderId, value);
        if (!r.ok) {
          setError(r.fieldErrors?.note);
          toast.error(r.message);
          return;
        }
        setError(undefined);
        toast.success("Note saved");
        router.refresh();
      } catch {
        toast.error("Something went wrong. Please try again.");
      }
    });

  return (
    <form
      className="space-y-2 rounded-md border border-border bg-surface p-4"
      data-testid="admin-note-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Label htmlFor="admin-note">Internal note</Label>
      <textarea
        id="admin-note"
        rows={3}
        maxLength={2000}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-describedby="admin-note-help"
        aria-invalid={error ? true : undefined}
        className="w-full rounded-md border border-border bg-bg p-3 text-base md:text-sm"
      />
      <FieldError errors={error} />
      <div className="flex items-center justify-between gap-2">
        <p id="admin-note-help" className="text-xs text-text-muted">Only admins see this.</p>
        <Button type="submit" variant="secondary" className="h-11 px-4" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save note"}
        </Button>
      </div>
    </form>
  );
}
