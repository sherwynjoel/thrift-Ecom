"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SITE_NAV } from "@/config/site";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="-ml-2 inline-flex size-11 items-center justify-center lg:hidden" aria-label="Open menu"><Menu className="size-5" /></SheetTrigger>
      <SheetContent side="left" className="bg-bg">
        <SheetTitle className="font-display text-2xl uppercase">Menu</SheetTitle>
        <nav className="mt-8 flex flex-col gap-1">
          {SITE_NAV.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center font-display text-3xl uppercase tracking-tight">{item.label}</Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
