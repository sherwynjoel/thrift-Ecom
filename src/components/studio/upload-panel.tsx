"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ImageUp, Loader2 } from "lucide-react";
import { designAssetFileError } from "@/lib/uploads";
import { cn } from "@/lib/utils";

export function UploadPanel({ onUpload, busy }: { onUpload(file: File): Promise<void>; busy: boolean }) {
  const [dragging, setDragging] = useState(false);

  async function take(file: File | undefined) {
    if (!file || busy) return;
    const problem = designAssetFileError(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    await onUpload(file);
  }

  return (
    <div className="space-y-4" data-testid="upload-panel">
      <label
        aria-busy={busy}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void take(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-6 text-center motion-safe:transition-colors",
          "focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/30",
          dragging ? "border-brand bg-brand/10" : "border-border bg-surface hover:border-text-muted",
          busy && "cursor-wait opacity-70",
        )}
      >
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          data-testid="upload-input"
          disabled={busy}
          onChange={(e) => {
            const input = e.currentTarget;
            void take(input.files?.[0]).finally(() => {
              input.value = ""; // the same file can be picked again
            });
          }}
        />
        {busy ? <Loader2 aria-hidden className="size-7 text-brand motion-safe:animate-spin" /> : <ImageUp aria-hidden className="size-7 text-brand" />}
        <span className="font-display text-xl tracking-wide">{busy ? "Uploading…" : "Choose an image"}</span>
        <span className="text-xs text-text-muted">Upload PNG, JPG or WebP · up to 10 MB</span>
      </label>
      <p className="text-xs leading-relaxed text-text-muted">For a sharp print use at least 3600 × 4800 px for a full-size design.</p>
      <p className="text-xs leading-relaxed text-text-muted">Transparent PNGs print best. Only the part inside the dashed area is printed.</p>
    </div>
  );
}
