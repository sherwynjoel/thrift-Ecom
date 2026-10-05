"use client";

import type { Fit } from "@prisma/client";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const CHART: Record<Fit, { size: string; chest: number; length: number }[]> = {
  OVERSIZED: [{ size: "S", chest: 44, length: 28 }, { size: "M", chest: 46, length: 29 }, { size: "L", chest: 48, length: 30 }, { size: "XL", chest: 50, length: 31 }, { size: "XXL", chest: 52, length: 32 }],
  REGULAR: [{ size: "S", chest: 38, length: 27 }, { size: "M", chest: 40, length: 28 }, { size: "L", chest: 42, length: 29 }, { size: "XL", chest: 44, length: 30 }, { size: "XXL", chest: 46, length: 31 }],
  RELAXED: [{ size: "S", chest: 41, length: 27.5 }, { size: "M", chest: 43, length: 28.5 }, { size: "L", chest: 45, length: 29.5 }, { size: "XL", chest: 47, length: 30.5 }, { size: "XXL", chest: 49, length: 31.5 }],
};

export function SizeGuide({ fit }: { fit: Fit }) {
  return (
    <Dialog>
      <DialogTrigger className="-my-3 inline-flex min-h-11 items-center px-1 text-sm text-text-muted underline-offset-4 hover:underline" data-testid="size-guide">Size guide</DialogTrigger>
      <DialogContent className="bg-bg">
        <DialogTitle className="font-display text-2xl uppercase">Size guide (inches)</DialogTitle>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-text-muted"><th className="py-2">Size</th><th>Chest</th><th>Length</th></tr></thead>
          <tbody>
            {CHART[fit].map((r) => (
              <tr key={r.size} className="border-t border-border"><td className="py-2 font-medium">{r.size}</td><td>{r.chest}</td><td>{r.length}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-text-muted">Garment measurements, laid flat. Between sizes? Size up for a roomier fit.</p>
      </DialogContent>
    </Dialog>
  );
}
