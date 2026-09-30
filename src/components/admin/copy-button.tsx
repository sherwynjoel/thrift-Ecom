"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setDone(true);
    toast.success("Copied");
    window.setTimeout(() => setDone(false), 1500);
  }
  return (
    <Button type="button" variant="secondary" onClick={copy} className={cn("h-11 px-4", className)} aria-label={label}>
      {done ? <Check className="size-4" /> : <Copy className="size-4" />} {done ? "Copied" : "Copy"}
    </Button>
  );
}
