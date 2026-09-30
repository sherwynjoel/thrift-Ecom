"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/account", label: "Overview", exact: true },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/addresses", label: "Addresses" },
];

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Account" className="flex gap-2 overflow-x-auto">
      {ITEMS.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "min-h-11 inline-flex shrink-0 items-center rounded-full px-4 text-sm",
              active ? "bg-surface-raised text-text" : "text-text-muted hover:bg-surface hover:text-text",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
