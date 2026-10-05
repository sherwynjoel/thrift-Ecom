"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Img = { url: string; alt: string; colorName: string | null };

export function Gallery({ images, activeColor, productName }: { images: Img[]; activeColor: string | null; productName: string }) {
  const forColor = images.filter((i) => i.colorName === activeColor || i.colorName === null);
  const shown = forColor.length ? forColor : images;
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  useEffect(() => setIndex(0), [activeColor]);
  const main = shown[Math.min(index, shown.length - 1)];
  if (!main) return <div className="aspect-[4/5] rounded-sm bg-surface" />;

  return (
    <div className="flex flex-col-reverse gap-3 lg:flex-row" data-testid="gallery">
      <ul className="flex gap-2 overflow-x-auto lg:w-20 lg:flex-col lg:overflow-visible">
        {shown.map((img, i) => (
          <li key={img.url}>
            <button type="button" onClick={() => setIndex(i)} aria-label={`Show image ${i + 1}`} aria-current={i === index} className={cn("relative aspect-[4/5] w-16 overflow-hidden rounded-sm border lg:w-full", i === index ? "border-brand" : "border-border")}>
              <Image src={img.url} alt="" fill sizes="80px" className="object-cover" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setZoom(true)} className="relative aspect-[4/5] flex-1 overflow-hidden rounded-sm bg-surface" aria-label="Zoom image">
        <Image src={main.url} alt={main.alt || productName} fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
      </button>
      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="bg-bg p-2 sm:max-w-4xl">
          <DialogTitle className="sr-only">{productName}</DialogTitle>
          <div className="relative aspect-[4/5] w-full">
            <Image src={main.url} alt={main.alt || productName} fill sizes="90vw" className="object-contain" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
